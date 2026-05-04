-- S3c Task 7 — create_reorder_purchase_order RPC body.
--
-- Fills in the empty shell from 20260419000001. One function serves
-- three HTTP entry points:
--
--   1. Row-level "Create PO" from a single suggestion.
--      rule_ids = [rule], items = [{rule_id, quantity_sqft, unit_cost}]
--      bulk = false.
--   2. Individual batch — N suggestions → N separate POs.
--      Caller invokes the RPC N times; nothing special server-side.
--   3. Supplier-grouped bulk — N suggestions for supplier X → 1 PO
--      with N line items. rule_ids = [rule_a, rule_b, ...],
--      items = [{rule_id, quantity_sqft, unit_cost}, ...],
--      bulk = true.
--
-- Transaction guarantees (Gemini sign-off):
--
--   * SELECT 1 FROM reorder_rules WHERE id = ANY(rule_ids) FOR UPDATE
--     locks every involved rule row first. Prevents a concurrent
--     create-PO-from-reorder flow from firing twice for the same
--     rule.
--   * generate_po_number() runs inside the same transaction.
--   * Insert PO header, then insert line items, then bump
--     last_triggered_at on each locked rule — all atomic.
--
-- Errors (distinct SQLSTATEs so the Rust adapter matches pg_code):
--   P0010  — RULE_NOT_FOUND (any id in rule_ids missing)
--   P0011  — RULE_INACTIVE (ran against a disabled rule)
--   P0012  — SUPPLIER_NOT_FOUND
--   P0013  — DUPLICATE_RULE_IDS (same rule_id listed twice in the
--           input array — would otherwise get counted as a
--           phantom missing rule and surface as RULE_NOT_FOUND)
--
-- Partial-success is NOT allowed: if ANY rule fails the preconditions,
-- the whole transaction rolls back — callers send the ids they're
-- sure about in one atomic group, or not at all.
--
-- Note: the legacy `auto_create_purchase_order()` helper is left in
-- place because `daily_reorder_check()` still references it. That
-- call chain (pg_cron-driven auto-reorder) stays inert in S3c per
-- the plan §"Out of scope"; S3d revisits it alongside a full
-- auto-reorder design. Dropping it now would break the function
-- pipeline without a replacement caller.

CREATE OR REPLACE FUNCTION create_reorder_purchase_order(
  rule_ids UUID[],
  supplier_id UUID,
  items JSONB,
  user_id UUID,
  bulk BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  po_number TEXT;
  po_id UUID;
  item_entry JSONB;
  item_rule_id UUID;
  po_item_line_total NUMERIC;
  total_subtotal NUMERIC := 0;
  line_number INTEGER := 0;
  rule_record RECORD;
  rule_count INTEGER;
  input_rule_count INTEGER;
BEGIN
  IF array_length(rule_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'RULE_IDS_REQUIRED' USING ERRCODE = 'P0010';
  END IF;

  -- Reject duplicate ids up front. Without this check, the
  -- existence-count comparison below would treat [rr-1, rr-1]
  -- as "1 found of 2 requested" and surface a phantom
  -- RULE_NOT_FOUND. Better error gives the UI the right corrective
  -- action ("you passed the same rule twice") instead of sending
  -- the operator to find a missing rule that isn't missing.
  IF (
    SELECT COUNT(*) FROM unnest(rule_ids) AS r
  ) <> (
    SELECT COUNT(DISTINCT r) FROM unnest(rule_ids) AS r
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_RULE_IDS (count=%)',
      array_length(rule_ids, 1) - (SELECT COUNT(DISTINCT r) FROM unnest(rule_ids) AS r)
      USING ERRCODE = 'P0013';
  END IF;

  -- Supplier lookup + existence check BEFORE we touch rules so a
  -- bad supplier_id doesn't block another transaction.
  IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = supplier_id) THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_FOUND (id=%)', supplier_id
      USING ERRCODE = 'P0012';
  END IF;

  -- 1. Lock every rule we're about to touch. ORDER BY id keeps the
  -- lock acquisition deterministic — two concurrent callers with
  -- overlapping rule_ids always acquire locks in the same order,
  -- avoiding deadlock.
  SELECT COUNT(*) INTO rule_count
  FROM (
    SELECT id
    FROM reorder_rules
    WHERE id = ANY(rule_ids)
    ORDER BY id
    FOR UPDATE
  ) locked;

  input_rule_count := array_length(rule_ids, 1);
  IF rule_count <> input_rule_count THEN
    RAISE EXCEPTION 'RULE_NOT_FOUND (requested=%, found=%)',
      input_rule_count, rule_count
      USING ERRCODE = 'P0010';
  END IF;

  -- 2. Guard against running against disabled rules. The UI should
  -- pre-filter, but server-side check prevents a stale client
  -- session from firing after the rule was deactivated.
  SELECT COUNT(*) INTO rule_count
  FROM reorder_rules
  WHERE id = ANY(rule_ids) AND active = false;
  IF rule_count > 0 THEN
    RAISE EXCEPTION 'RULE_INACTIVE (count=%)', rule_count
      USING ERRCODE = 'P0011';
  END IF;

  -- 3. Mint the PO number. generate_po_number() uses the per-year
  -- sequence added in Task 1, so this is race-safe.
  po_number := generate_po_number();

  -- 4. Insert the PO header. reorder_rule_id gets the first rule id
  -- for row / individual paths; for bulk-multi-rule we stamp NULL
  -- (no single "source" rule) — the UI renders "Bulk reorder PO"
  -- for that case.
  INSERT INTO purchase_orders (
    po_number,
    supplier_id,
    status,
    auto_generated,
    reorder_rule_id,
    created_by
  ) VALUES (
    po_number,
    supplier_id,
    'draft',
    true,
    CASE WHEN bulk AND array_length(rule_ids, 1) > 1 THEN NULL
         ELSE rule_ids[1]
    END,
    user_id::TEXT
  )
  RETURNING id INTO po_id;

  -- 5. Insert line items. Each item carries (rule_id, quantity_sqft,
  -- unit_cost) — we resolve the material_type_id + description from
  -- the rule's material_type row.
  FOR item_entry IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    line_number := line_number + 1;
    item_rule_id := (item_entry->>'rule_id')::UUID;

    SELECT rr.material_type_id, mt.name AS material_name
      INTO rule_record
      FROM reorder_rules rr
      JOIN material_types mt ON mt.id = rr.material_type_id
      WHERE rr.id = item_rule_id;

    IF NOT FOUND THEN
      -- Defensive: the prior FOR UPDATE block already confirmed
      -- existence, but the item payload could still reference an
      -- id NOT in rule_ids. Fail loud rather than silently drop.
      RAISE EXCEPTION 'RULE_NOT_FOUND (item rule_id=%)', item_rule_id
        USING ERRCODE = 'P0010';
    END IF;

    po_item_line_total := ROUND(
      (item_entry->>'quantity_sqft')::NUMERIC
      * (item_entry->>'unit_cost')::NUMERIC,
      2
    );

    INSERT INTO purchase_order_items (
      purchase_order_id,
      material_type_id,
      line_number,
      description,
      quantity_sqft,
      unit_cost,
      line_total
    ) VALUES (
      po_id,
      rule_record.material_type_id,
      line_number,
      rule_record.material_name,
      (item_entry->>'quantity_sqft')::NUMERIC,
      (item_entry->>'unit_cost')::NUMERIC,
      po_item_line_total
    );

    total_subtotal := total_subtotal + po_item_line_total;
  END LOOP;

  -- 6. Bump last_triggered_at on every rule in the batch.
  UPDATE reorder_rules
    SET last_triggered_at = now()
    WHERE id = ANY(rule_ids);

  -- 7. Return the freshly-minted PO + line count + rule ids for
  -- the notification payload.
  RETURN jsonb_build_object(
    'po_id', po_id,
    'po_number', po_number,
    'supplier_id', supplier_id,
    'items_count', line_number,
    'subtotal', total_subtotal,
    'rule_ids', to_jsonb(rule_ids),
    'bulk', bulk
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_reorder_purchase_order(UUID[], UUID, JSONB, UUID, BOOLEAN) IS
  'Transactional reorder → PO flow (row / individual batch / bulk). FOR UPDATE locks rule rows, mints PO number via generate_po_number, inserts PO + items, bumps last_triggered_at. Partial success not allowed. SQLSTATEs: P0010 RULE_NOT_FOUND, P0011 RULE_INACTIVE, P0012 SUPPLIER_NOT_FOUND. S3c Task 7.';
