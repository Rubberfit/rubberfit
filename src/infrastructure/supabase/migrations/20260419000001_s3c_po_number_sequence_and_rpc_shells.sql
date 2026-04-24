-- S3c Task 1 — PO number sequence + empty RPC shells.
--
-- Three things happen in this migration:
--
-- 1. Port generate_po_number() to use a per-year Postgres SEQUENCE
--    object instead of SELECT MAX(...) + 1. The old implementation
--    is race-prone under concurrent PO creates from multiple API
--    instances (Fly autoscale + reorder-suggestion auto-create both
--    generate parallel calls). The UNIQUE constraint on
--    purchase_orders.po_number currently catches the race as a
--    hard-to-debug 23505 error; the sequence kills the race.
--
-- 2. Pre-create sequences for already-observed years and seed them
--    past the highest existing po_number for that year, so the first
--    post-migration nextval() does not collide with a row written by
--    the old SELECT MAX function.
--
-- 3. Add empty-shell `receive_purchase_order` and
--    `create_reorder_purchase_order` functions. They return NULL /
--    error until Task 5 and Task 7 land the bodies, but defining the
--    signatures here keeps subsequent migrations focused on logic
--    changes instead of re-declaring the function shape.
--
-- Safety:
-- * No drops, no column changes. Only function redefinitions + new
--   sequences seeded from existing data.
-- * Sequence seeding uses setval with is_called=true, so nextval()
--   returns (seed + 1). is_called=false would return the seed itself
--   — wrong for us because the seed is the *last* used value.
-- * The old auto_create_purchase_order() helper is NOT dropped here.
--   Task 7's migration supersedes it along with the full RPC body.

-- ---------------------------------------------------------------
-- 1. Per-year PO-number sequences
-- ---------------------------------------------------------------

-- Helper that returns a sequence name for a given 2-digit year.
-- Pure formatting — callers MUST quote_ident() the result before
-- using it in DDL or DML (see generate_po_number below).
CREATE OR REPLACE FUNCTION po_number_sequence_name(year_suffix TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'po_number_seq_' || year_suffix
$$;

-- Rewrite generate_po_number() to use nextval() on a lazily-created
-- per-year sequence. Behavior stays PO-YY-NNNN; semantics become
-- race-safe.
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT AS $$
DECLARE
  year_suffix TEXT;
  seq_name TEXT;
  next_sequence BIGINT;
BEGIN
  year_suffix := TO_CHAR(CURRENT_DATE, 'YY');
  seq_name := po_number_sequence_name(year_suffix);

  -- Create the per-year sequence if it does not exist yet, seeding
  -- it to the largest existing sequence number for the year so the
  -- first nextval after rollover does not collide with a prior
  -- generator's output.
  -- Scope the existence check to the `public` schema (the schema
  -- holding purchase_orders). Without the namespace filter, an
  -- unrelated sequence named the same in another schema could
  -- make us skip creation and fall through to a nextval() on a
  -- sequence the function can't actually resolve — better to be
  -- explicit about where we look.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relkind = 'S'
      AND c.relname = seq_name
      AND n.nspname = 'public'
  ) THEN
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', seq_name);
    -- Seed from current max for this year. If no rows exist, setval
    -- with is_called=false so the first nextval returns 1.
    DECLARE
      existing_max BIGINT;
    BEGIN
      SELECT COALESCE(
        MAX(CAST(SUBSTRING(po_number FROM 'PO-' || year_suffix || '-(\d+)') AS BIGINT)),
        0
      )
      INTO existing_max
      FROM purchase_orders
      WHERE po_number LIKE 'PO-' || year_suffix || '-%';

      IF existing_max > 0 THEN
        -- is_called=true => nextval returns (existing_max + 1).
        EXECUTE format('SELECT setval(%L, %s, true)', seq_name, existing_max);
      ELSE
        -- is_called=false => nextval returns 1.
        EXECUTE format('SELECT setval(%L, 1, false)', seq_name);
      END IF;
    END;
  END IF;

  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_sequence;
  RETURN 'PO-' || year_suffix || '-' || LPAD(next_sequence::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Pre-seed sequences for every (2-digit) year that currently has
-- rows in purchase_orders. This avoids a cold start on the first
-- post-deploy PO create.
DO $$
DECLARE
  row RECORD;
  seq_name TEXT;
BEGIN
  FOR row IN
    SELECT
      SUBSTRING(po_number FROM '^PO-([0-9]{2})-') AS yy,
      MAX(CAST(SUBSTRING(po_number FROM '^PO-[0-9]{2}-([0-9]+)$') AS BIGINT)) AS max_seq
    FROM purchase_orders
    WHERE po_number ~ '^PO-[0-9]{2}-[0-9]+$'
    GROUP BY 1
  LOOP
    seq_name := po_number_sequence_name(row.yy);
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', seq_name);
    EXECUTE format('SELECT setval(%L, %s, true)', seq_name, row.max_seq);
  END LOOP;
END $$;

COMMENT ON FUNCTION generate_po_number() IS
  'Returns the next PO-YY-NNNN number using a per-year sequence. Race-safe under concurrent callers (S3c Task 1).';

-- ---------------------------------------------------------------
-- 2. receive_purchase_order — empty shell (body in Task 5)
-- ---------------------------------------------------------------
--
-- Final signature from the plan: (po_id UUID, items JSONB, user_id UUID)
-- returns a JSONB describing { po, items, roll_ids[], partial BOOL }.
-- This shell errors out immediately so anyone wiring it too early
-- gets a loud failure, not a silent no-op.
CREATE OR REPLACE FUNCTION receive_purchase_order(
  po_id UUID,
  items JSONB,
  user_id UUID
)
RETURNS JSONB AS $$
BEGIN
  -- Body lands in the S3c Task 5 migration. Until then, callers
  -- fall back to the legacy TS receivePurchaseOrder path. The shell
  -- exists so Task 5 only has to replace the body, not the
  -- signature — matters because function signatures are part of
  -- the PostgREST RPC surface and churning them invalidates
  -- cached schema metadata in the gateway.
  RAISE EXCEPTION 'receive_purchase_order not yet implemented (S3c Task 5)'
    USING ERRCODE = 'feature_not_supported';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION receive_purchase_order(UUID, JSONB, UUID) IS
  'Transactional PO receive flow. Shell only (S3c Task 1); body lands in Task 5.';

-- ---------------------------------------------------------------
-- 3. create_reorder_purchase_order — empty shell (body in Task 7)
-- ---------------------------------------------------------------
--
-- Final signature: (rule_ids UUID[], supplier_id UUID, items JSONB,
-- user_id UUID, bulk BOOLEAN) returns JSONB describing the created
-- PO.
CREATE OR REPLACE FUNCTION create_reorder_purchase_order(
  rule_ids UUID[],
  supplier_id UUID,
  items JSONB,
  user_id UUID,
  bulk BOOLEAN
)
RETURNS JSONB AS $$
BEGIN
  RAISE EXCEPTION 'create_reorder_purchase_order not yet implemented (S3c Task 7)'
    USING ERRCODE = 'feature_not_supported';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_reorder_purchase_order(UUID[], UUID, JSONB, UUID, BOOLEAN) IS
  'Transactional reorder → PO flow (row / individual batch / bulk). Shell only (S3c Task 1); body lands in Task 7. Supersedes auto_create_purchase_order() which will be dropped alongside the Task 7 body.';
