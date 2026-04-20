-- S3c Task 5 — receive_purchase_order RPC body.
--
-- Fills in the empty shell declared by S3c Task 1's migration
-- (20260419000001). The function encapsulates the three-table
-- receive transaction the legacy TS path did sequentially (with no
-- rollback on partial failure):
--
--   1. Lock the PO row FOR UPDATE so a concurrent receive or
--      header update can't race the multi-table write.
--   2. For each item in `items`:
--      a. UPDATE purchase_order_items.quantity_received +
--         received_date (accumulates, doesn't overwrite).
--      b. If `roll_data` is present and `quantity_received > 0`,
--         INSERT a row into `rolls` with fields hydrated from the
--         PO item (material_type_id, material_type name,
--         unit_cost) plus the caller-supplied roll overrides
--         (width/length/thickness/color/location).
--   3. Check whether every item's quantity_received >= quantity_sqft.
--      If so, set purchase_orders.status = 'received' +
--      actual_delivery_date = now() (partial receipts allowed;
--      status does not flip).
--   4. Return a JSONB summary: { po_id, items_received, roll_ids,
--      partial_receipt, completed_at }.
--
-- Errors:
--   * PO not found           → SQLSTATE P0001 (code 'PO_NOT_FOUND').
--   * PO already received    → SQLSTATE P0002 (code 'PO_ALREADY_RECEIVED').
--   * PO status != ordered   → SQLSTATE P0003 (code 'PO_NOT_ORDERABLE').
--   * item_id not in PO      → SQLSTATE P0004 (code 'PO_ITEM_NOT_FOUND').
--   * CHECK-constraint (quantity_received <= quantity_sqft)
--     fires if a caller passes a too-large quantity — Postgres
--     rolls the whole tx back with SQLSTATE 23514 (CHECK_VIOLATION).
--
-- Distinct SQLSTATEs per sentinel let the Rust adapter match on
-- `pg_code` alone (stable across PostgREST envelope changes)
-- instead of pattern-matching on the RAISE message string.
--
-- Input shape:
--   items = [
--     {
--       "item_id": "uuid",
--       "quantity_received": number,    -- increment, not total
--       "roll_data": {                  -- optional
--         "width": number,
--         "length": number,
--         "thickness": number,
--         "color": "string" | null,
--         "location": "string" | null
--       }
--     }
--   ]

CREATE OR REPLACE FUNCTION receive_purchase_order(
  po_id UUID,
  items JSONB,
  user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  current_po RECORD;
  item_entry JSONB;
  po_item RECORD;
  supplier_name TEXT;
  new_quantity_received NUMERIC;
  roll_record RECORD;
  roll_ids UUID[] := ARRAY[]::UUID[];
  items_received INTEGER := 0;
  fully_received BOOLEAN;
  completed_at TIMESTAMPTZ := NULL;
BEGIN
  -- 1. Lock the PO header. Any concurrent edit on the header or a
  --    parallel receive flow waits here.
  SELECT id, status, supplier_id
    INTO current_po
    FROM purchase_orders
    WHERE id = po_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF current_po.status = 'received' THEN
    RAISE EXCEPTION 'PO_ALREADY_RECEIVED' USING ERRCODE = 'P0002';
  END IF;

  -- Plan §"PO status state machine": `received` is the terminal
  -- status reachable only from `ordered` via this flow. Receiving
  -- against a draft / pending / approved / cancelled PO would
  -- either skip the supplier-placement step or re-open a cancelled
  -- order. Block every other source status with a dedicated code
  -- so the UI can surface "move the PO to ordered first" instead
  -- of a generic error.
  IF current_po.status <> 'ordered' THEN
    RAISE EXCEPTION 'PO_NOT_ORDERABLE (status=%)', current_po.status
      USING ERRCODE = 'P0003';
  END IF;

  -- Supplier name for the `rolls.supplier` denormalized column.
  -- Lookup happens once per receive flow rather than once per item.
  SELECT name INTO supplier_name
    FROM suppliers
    WHERE id = current_po.supplier_id;

  -- 2. Walk every item the caller wants to receive.
  FOR item_entry IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    items_received := items_received + 1;

    -- Resolve the PO item, pulling material_type + dimensions so
    -- roll hydration defaults match the ordered spec when the
    -- caller omits them.
    SELECT
        pi.id,
        pi.purchase_order_id,
        pi.material_type_id,
        pi.quantity_sqft,
        pi.quantity_received,
        pi.unit_cost,
        pi.width,
        pi.length,
        pi.thickness,
        pi.color,
        mt.name AS material_name
      INTO po_item
      FROM purchase_order_items pi
      JOIN material_types mt ON mt.id = pi.material_type_id
      WHERE pi.id = (item_entry->>'item_id')::UUID
        AND pi.purchase_order_id = po_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PO_ITEM_NOT_FOUND (item_id=%)',
        item_entry->>'item_id'
        USING ERRCODE = 'P0004';
    END IF;

    -- 2a. Accumulate quantity_received. CHECK constraint on the
    -- column blocks overflow; rollback surfaces as 23514 to the
    -- caller which maps to CHECK_VIOLATION.
    new_quantity_received := COALESCE(po_item.quantity_received, 0)
      + (item_entry->>'quantity_received')::NUMERIC;

    UPDATE purchase_order_items
      SET quantity_received = new_quantity_received,
          received_date = CURRENT_DATE
      WHERE id = po_item.id;

    -- 2b. Optional roll creation. The caller may pass
    -- quantity_received > 0 but omit roll_data for a
    -- "quantity-only receipt" (e.g. partial delivery of loose
    -- stock); the PO item update stands either way.
    IF (item_entry ? 'roll_data')
       AND (item_entry->>'quantity_received')::NUMERIC > 0 THEN
      INSERT INTO rolls (
        user_id,
        material_type_id,
        material_type,
        width,
        length,
        thickness,
        color,
        location,
        date_received,
        supplier,
        cost_per_sqft,
        remaining_length,
        status,
        notes
      ) VALUES (
        user_id,
        po_item.material_type_id,
        po_item.material_name,
        COALESCE(
          (item_entry->'roll_data'->>'width')::NUMERIC,
          po_item.width,
          60
        ),
        COALESCE(
          (item_entry->'roll_data'->>'length')::NUMERIC,
          (item_entry->>'quantity_received')::NUMERIC
        ),
        COALESCE(
          (item_entry->'roll_data'->>'thickness')::NUMERIC,
          po_item.thickness,
          0.125
        ),
        COALESCE(
          item_entry->'roll_data'->>'color',
          po_item.color
        ),
        COALESCE(
          item_entry->'roll_data'->>'location',
          'Receiving'
        ),
        CURRENT_DATE,
        COALESCE(supplier_name, 'Unknown'),
        po_item.unit_cost,
        COALESCE(
          (item_entry->'roll_data'->>'length')::NUMERIC,
          (item_entry->>'quantity_received')::NUMERIC
        ),
        'active',
        'Received from PO ' || po_id::TEXT
      )
      RETURNING id INTO roll_record;

      roll_ids := array_append(roll_ids, roll_record.id);
    END IF;
  END LOOP;

  -- 3. Status flip. A PO with ANY item still short on
  -- quantity_received stays at its pre-receive status; only a
  -- fully-received PO transitions to 'received' + stamps
  -- actual_delivery_date. Partial receipts are allowed (plan:
  -- §"PO receive flow — transactional RPC with row lock").
  SELECT bool_and(quantity_received >= quantity_sqft)
    INTO fully_received
    FROM purchase_order_items
    WHERE purchase_order_id = po_id;

  IF fully_received THEN
    UPDATE purchase_orders
      SET status = 'received',
          actual_delivery_date = CURRENT_DATE
      WHERE id = po_id;
    completed_at := now();
  END IF;

  RETURN jsonb_build_object(
    'po_id', po_id,
    'items_received', items_received,
    'roll_ids', to_jsonb(roll_ids),
    'partial_receipt', NOT COALESCE(fully_received, false),
    'completed_at', completed_at
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION receive_purchase_order(UUID, JSONB, UUID) IS
  'Transactional PO receive flow. Locks the PO row FOR UPDATE, updates purchase_order_items.quantity_received + received_date, inserts rolls for items with roll_data + positive quantity, flips PO status to received (+ stamps actual_delivery_date) once every item is fully received. Partial receipts allowed. Returns { po_id, items_received, roll_ids, partial_receipt, completed_at }. S3c Task 5.';
