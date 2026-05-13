-- ═══════════════════════════════════════════════════════════════════════════
-- REDESIGN — File 8 of 9: Functions & triggers
-- ═══════════════════════════════════════════════════════════════════════════
-- Procedural logic layered on top of the schema:
--
--   1. set_updated_at()                      — generic updated_at bump
--   2. rolls_auto_deplete()                  — status='depleted' when empty
--   3. rolls_notify_depleted()               — fires roll_depleted notification
--   4. rolls_notify_low_stock()              — fires low_stock notification to
--                                              tenant admins on threshold cross
--   5. cuts_decrement_roll_and_notify()      — decrements roll (clamp to 0),
--                                              fires cut_completed to cutter
--   6. price_history_calc_change()           — computes price_change_percentage
--   7. notification_queue_schedule_retry()   — exponential backoff on failure
--
-- Policy choices (from AskUserQuestion):
--   • Low-stock recipients: admins only (members with 'admin' in roles[])
--   • Cut-completed recipient: cuts.cut_by (falls back to created_by);
--     no notification if neither set
--   • Underflow policy: clamp remaining_length_mm to 0, auto-deplete the roll
--
-- Retry backoff formula: 5 min × 3^retry_count (matches legacy).
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION 1: set_updated_at — generic BEFORE UPDATE bump
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at() IS
  'Generic trigger function: stamps NEW.updated_at = now() on every UPDATE.';


-- ═══════════════════════════════════════════════════════════════════════════
-- updated_at triggers — every table with an updated_at column
-- ═══════════════════════════════════════════════════════════════════════════

-- Core (file 1)
CREATE TRIGGER trg_plans_updated_at             BEFORE UPDATE ON plans              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tenants_updated_at           BEFORE UPDATE ON tenants            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tenant_settings_updated_at   BEFORE UPDATE ON tenant_settings    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at     BEFORE UPDATE ON subscriptions      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated_at          BEFORE UPDATE ON profiles           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_memberships_updated_at       BEFORE UPDATE ON memberships        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_preferences_updated_at  BEFORE UPDATE ON user_preferences   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_addresses_updated_at         BEFORE UPDATE ON addresses          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_persons_updated_at           BEFORE UPDATE ON persons            FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Inventory (file 2)
CREATE TRIGGER trg_material_types_updated_at        BEFORE UPDATE ON material_types        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_suppliers_updated_at             BEFORE UPDATE ON suppliers             FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_supplier_contacts_updated_at     BEFORE UPDATE ON supplier_contacts     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_material_suppliers_updated_at    BEFORE UPDATE ON material_suppliers    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_rolls_updated_at                 BEFORE UPDATE ON rolls                 FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reorder_rules_updated_at         BEFORE UPDATE ON reorder_rules         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- price_history: immutable, no updated_at

-- Operations (file 3)
CREATE TRIGGER trg_cuts_updated_at          BEFORE UPDATE ON cuts          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cut_history_updated_at   BEFORE UPDATE ON cut_history   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cut_favorites_updated_at BEFORE UPDATE ON cut_favorites FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- cut_history_selection: insert-only, no updated_at
-- Offcut rolls live in the rolls table; rolls already has trg_rolls_updated_at

-- Commerce (file 4)
CREATE TRIGGER trg_projects_updated_at              BEFORE UPDATE ON projects              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_project_owners_updated_at        BEFORE UPDATE ON project_owners        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_project_materials_updated_at     BEFORE UPDATE ON project_materials     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- project_cut_histories: no updated_at column
CREATE TRIGGER trg_invoices_updated_at              BEFORE UPDATE ON invoices              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_jobs_updated_at                  BEFORE UPDATE ON jobs                  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_job_parts_updated_at             BEFORE UPDATE ON job_parts             FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_job_assignees_updated_at         BEFORE UPDATE ON job_assignees         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_job_roll_allocations_updated_at  BEFORE UPDATE ON job_roll_allocations  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_purchase_orders_updated_at       BEFORE UPDATE ON purchase_orders       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_purchase_order_items_updated_at  BEFORE UPDATE ON purchase_order_items  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Notifications (file 5)
CREATE TRIGGER trg_notifications_updated_at       BEFORE UPDATE ON notifications       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notification_queue_updated_at  BEFORE UPDATE ON notification_queue  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Reference (file 6)
CREATE TRIGGER trg_tax_rates_updated_at BEFORE UPDATE ON tax_rates FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION 2: rolls_auto_deplete — set status='depleted' when empty
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rolls_auto_deplete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.remaining_length_mm = 0 AND NEW.status = 'active' THEN
    NEW.status := 'depleted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rolls_auto_deplete
  BEFORE UPDATE OF remaining_length_mm ON rolls
  FOR EACH ROW
  EXECUTE FUNCTION rolls_auto_deplete();


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION 3: rolls_notify_depleted — fire roll_depleted to admins on
--             status transition active → depleted
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rolls_notify_depleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_material_name varchar(100);
BEGIN
  IF OLD.status = NEW.status OR NEW.status <> 'depleted' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_material_name FROM material_types WHERE id = NEW.material_type_id;

  INSERT INTO notifications (tenant_id, user_id, type, title, description, material_type)
  SELECT
    NEW.tenant_id,
    m.profile_id,
    'roll_depleted',
    'Roll depleted: ' || COALESCE(v_material_name, 'unknown material'),
    format('A %s roll has been fully consumed.', COALESCE(v_material_name, 'material')),
    v_material_name
  FROM memberships m
  WHERE m.tenant_id = NEW.tenant_id
    AND 'admin' = ANY(m.roles)
    AND m.deleted_at IS NULL;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never let a notification failure roll back the roll status update.
    RAISE WARNING 'rolls_notify_depleted failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rolls_notify_depleted
  AFTER UPDATE OF status ON rolls
  FOR EACH ROW
  EXECUTE FUNCTION rolls_notify_depleted();


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION 4: rolls_notify_low_stock — fire low_stock to admins on
--             threshold-crossing event. Uses aggregate remaining area
--             across all active rolls for the material.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rolls_notify_low_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold_sqm   numeric;
  v_current_sqmm    bigint;
  v_current_sqm     numeric;
  v_old_sqm         numeric;
  v_material_name   varchar(100);
BEGIN
  -- Only evaluate on real length decreases
  IF NEW.remaining_length_mm >= OLD.remaining_length_mm THEN
    RETURN NEW;
  END IF;

  SELECT min_stock_sqm, name
    INTO v_threshold_sqm, v_material_name
    FROM material_types
   WHERE id = NEW.material_type_id;

  IF v_threshold_sqm IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(width_mm::bigint * remaining_length_mm::bigint), 0)
    INTO v_current_sqmm
    FROM rolls
   WHERE material_type_id = NEW.material_type_id
     AND tenant_id = NEW.tenant_id
     AND status = 'active'
     AND deleted_at IS NULL;

  v_current_sqm := v_current_sqmm::numeric / 1000000.0;
  -- Reconstruct pre-update aggregate by adding back the lost area for this row.
  v_old_sqm := v_current_sqm
               + ((OLD.remaining_length_mm - NEW.remaining_length_mm)::numeric * NEW.width_mm / 1000000.0);

  -- Fire only on the crossing event
  IF v_current_sqm < v_threshold_sqm AND v_old_sqm >= v_threshold_sqm THEN
    INSERT INTO notifications (
      tenant_id, user_id, type, title, description,
      material_type, current_value, threshold_value
    )
    SELECT
      NEW.tenant_id,
      m.profile_id,
      'low_stock',
      'Low stock: ' || COALESCE(v_material_name, 'unknown material'),
      format('Stock for %s has dropped below the configured threshold.', COALESCE(v_material_name, 'this material')),
      v_material_name,
      v_current_sqm,
      v_threshold_sqm
    FROM memberships m
    WHERE m.tenant_id = NEW.tenant_id
      AND 'admin' = ANY(m.roles)
      AND m.deleted_at IS NULL;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'rolls_notify_low_stock failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rolls_notify_low_stock
  AFTER UPDATE OF remaining_length_mm ON rolls
  FOR EACH ROW
  EXECUTE FUNCTION rolls_notify_low_stock();


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION 5: cuts_decrement_roll_and_notify — decrement roll length
--             (clamp to 0) and fire cut_completed to the cutter
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cuts_decrement_roll_and_notify()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_recipient      uuid;
  v_material_name  varchar(100);
BEGIN
  -- 1. Decrement the roll (clamp to zero).
  IF NEW.roll_id IS NOT NULL THEN
    UPDATE rolls
       SET remaining_length_mm = GREATEST(0, remaining_length_mm - (NEW.cut_length_mm * NEW.quantity))
     WHERE id = NEW.roll_id;
  END IF;

  -- 2. Notify the cutter (falls back to record author).
  v_recipient := COALESCE(NEW.cut_by, NEW.created_by);
  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.roll_id IS NOT NULL THEN
    SELECT mt.name
      INTO v_material_name
      FROM rolls r
      JOIN material_types mt ON mt.id = r.material_type_id
     WHERE r.id = NEW.roll_id;
  END IF;

  INSERT INTO notifications (tenant_id, user_id, type, title, description, material_type)
  VALUES (
    NEW.tenant_id,
    v_recipient,
    'cut_completed',
    'Cut completed' || COALESCE(': ' || v_material_name, ''),
    format('Cut of %s mm × %s mm (qty %s) recorded.', NEW.cut_length_mm, NEW.cut_width_mm, NEW.quantity),
    v_material_name
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never fail a cut INSERT because a notification INSERT failed.
    RAISE WARNING 'cuts_decrement_roll_and_notify failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cuts_decrement_roll_and_notify
  AFTER INSERT ON cuts
  FOR EACH ROW
  EXECUTE FUNCTION cuts_decrement_roll_and_notify();


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION 6: price_history_calc_change — compute price_change_percentage
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION price_history_calc_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.old_cost_per_sqm_cents IS NOT NULL AND NEW.old_cost_per_sqm_cents > 0 THEN
    NEW.price_change_percentage :=
      ROUND(
        ((NEW.new_cost_per_sqm_cents::numeric - NEW.old_cost_per_sqm_cents::numeric)
          / NEW.old_cost_per_sqm_cents::numeric) * 100,
        4
      );
  ELSE
    NEW.price_change_percentage := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_price_history_calc_change
  BEFORE INSERT ON price_history
  FOR EACH ROW
  EXECUTE FUNCTION price_history_calc_change();


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION 7: notification_queue_schedule_retry — exponential backoff
--             on status transition to 'failed'. Formula: 5 min × 3^retry_count.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notification_queue_schedule_retry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'failed' AND NEW.status = 'failed' THEN
    IF NEW.retry_count < NEW.max_retries THEN
      NEW.next_retry_at := now() + (power(3, NEW.retry_count) * interval '5 minutes');
    ELSE
      NEW.next_retry_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notification_queue_schedule_retry
  BEFORE UPDATE OF status ON notification_queue
  FOR EACH ROW
  EXECUTE FUNCTION notification_queue_schedule_retry();


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION 8: jobs_assign_number — auto-assign job_number on INSERT
-- ═══════════════════════════════════════════════════════════════════════════
-- Format: J-000001, J-000002, … from a single global sequence (intentionally
-- not per-tenant — keeps job IDs unique across tenants for support workflows
-- and printed receipts where the operator might be reading a J-number out of
-- context). Sequence is consumed only when caller leaves job_number NULL or
-- empty; explicit values pass through untouched (lets us round-trip imports).

CREATE SEQUENCE IF NOT EXISTS jobs_number_seq START 1;
COMMENT ON SEQUENCE jobs_number_seq IS
  'Monotonic sequence for jobs.job_number. Format: J-<6-digit zero-padded>. Do not reset.';

CREATE OR REPLACE FUNCTION jobs_assign_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    NEW.job_number := 'J-' || LPAD(nextval('jobs_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jobs_assign_number
  BEFORE INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION jobs_assign_number();


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION 9: generate_po_number — race-safe per-year PO numbering
-- ═══════════════════════════════════════════════════════════════════════════
-- Format: PO-YYYY-NNNN. Uses a per-year Postgres sequence (lazily created) to
-- avoid the SELECT MAX(...) + 1 race that bites under concurrent PO creates
-- (Fly autoscale + reorder-suggestion auto-create can fire in parallel).
-- Ported from dev's 20260419000001_s3c_po_number_sequence_and_rpc_shells.sql.

CREATE OR REPLACE FUNCTION po_number_sequence_name(year_suffix text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'po_number_seq_' || year_suffix
$$;

CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS text AS $$
DECLARE
  year_suffix text;
  seq_name    text;
  next_seq    bigint;
BEGIN
  year_suffix := TO_CHAR(CURRENT_DATE, 'YYYY');
  seq_name    := po_number_sequence_name(year_suffix);

  -- Create the per-year sequence if missing. Scope the existence check to the
  -- public schema explicitly so a same-named sequence in another schema can't
  -- make us fall through to a nextval() the function can't actually resolve.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relkind = 'S'
      AND c.relname = seq_name
      AND n.nspname = 'public'
  ) THEN
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', seq_name);
    -- Seed from current max for this year. If no rows exist, use is_called=false
    -- so the first nextval returns 1.
    DECLARE
      existing_max bigint;
    BEGIN
      SELECT COALESCE(
        MAX(CAST(SUBSTRING(po_number FROM 'PO-' || year_suffix || '-(\d+)') AS bigint)),
        0
      )
      INTO existing_max
      FROM purchase_orders
      WHERE po_number LIKE 'PO-' || year_suffix || '-%';

      IF existing_max > 0 THEN
        EXECUTE format('SELECT setval(%L, %s, true)', seq_name, existing_max);
      ELSE
        EXECUTE format('SELECT setval(%L, 1, false)', seq_name);
      END IF;
    END;
  END IF;

  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_seq;
  RETURN 'PO-' || year_suffix || '-' || LPAD(next_seq::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_po_number() IS
  'Returns the next PO-YYYY-NNNN number using a per-year sequence. Race-safe under concurrent callers.';


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION 10: upsert_cached_tax_rate — Avalara cache write helper
-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER so the Next.js tax-API cache worker can write avalara-source
-- rows without holding platform-admin role. RLS policy `tax_rates_write_platform_admin`
-- still gates direct INSERTs/UPDATEs from regular sessions; this function is the
-- documented bypass for the cache pipeline. EXECUTE granted to authenticated.
-- Ported from dev's 20260222000001_add_tax_api_cache_columns.sql.

CREATE OR REPLACE FUNCTION upsert_cached_tax_rate(
  p_state      varchar(2),
  p_city       varchar(100),
  p_zip_code   varchar(20),
  p_tax_rate   numeric(5,4),
  p_tax_name   varchar(200),
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Try update first (matches an existing active row at the same jurisdiction).
  UPDATE tax_rates
     SET tax_rate   = p_tax_rate,
         tax_name   = p_tax_name,
         source     = 'avalara',
         fetched_at = now(),
         expires_at = p_expires_at,
         updated_at = now()
   WHERE state = p_state
     AND ((city IS NULL AND p_city IS NULL) OR city = p_city)
     AND ((zip_code IS NULL AND p_zip_code IS NULL) OR zip_code = p_zip_code)
     AND is_active = true
     AND deleted_at IS NULL;

  -- If no row was updated, insert a new cached entry.
  IF NOT FOUND THEN
    INSERT INTO tax_rates (
      state, city, zip_code, tax_rate, tax_name,
      source, fetched_at, expires_at, is_active
    )
    VALUES (
      p_state, p_city, p_zip_code, p_tax_rate, p_tax_name,
      'avalara', now(), p_expires_at, true
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION upsert_cached_tax_rate(varchar, varchar, varchar, numeric, varchar, timestamptz) IS
  'Inserts or updates a cached tax rate from the Avalara API. SECURITY DEFINER bypass for the cache pipeline.';

GRANT EXECUTE ON FUNCTION upsert_cached_tax_rate(varchar, varchar, varchar, numeric, varchar, timestamptz)
  TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION 11: get_tax_rate_for_location — read helper, scalar return
-- ═══════════════════════════════════════════════════════════════════════════
-- Cascades zip → city → state → 8% default. Used by the PO + invoice tax
-- compute paths. Ported from dev's 20260220000001_add_tax_configuration.sql.

CREATE OR REPLACE FUNCTION get_tax_rate_for_location(
  p_state    varchar(2),
  p_city     varchar(100) DEFAULT NULL,
  p_zip_code varchar(20)  DEFAULT NULL
)
RETURNS numeric(5,4)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tax_rate numeric(5,4);
BEGIN
  -- Most specific: zip-level
  IF p_zip_code IS NOT NULL THEN
    SELECT tax_rate INTO v_tax_rate
      FROM tax_rates
     WHERE state = p_state
       AND city = p_city
       AND zip_code = p_zip_code
       AND is_active = true
       AND deleted_at IS NULL
     LIMIT 1;
    IF v_tax_rate IS NOT NULL THEN RETURN v_tax_rate; END IF;
  END IF;

  -- Mid: city-level (no zip)
  IF p_city IS NOT NULL THEN
    SELECT tax_rate INTO v_tax_rate
      FROM tax_rates
     WHERE state = p_state
       AND city = p_city
       AND zip_code IS NULL
       AND is_active = true
       AND deleted_at IS NULL
     LIMIT 1;
    IF v_tax_rate IS NOT NULL THEN RETURN v_tax_rate; END IF;
  END IF;

  -- Coarsest: state-level
  SELECT tax_rate INTO v_tax_rate
    FROM tax_rates
   WHERE state = p_state
     AND city IS NULL
     AND zip_code IS NULL
     AND is_active = true
     AND deleted_at IS NULL
   LIMIT 1;

  RETURN COALESCE(v_tax_rate, 0.08);
END;
$$;

COMMENT ON FUNCTION get_tax_rate_for_location(varchar, varchar, varchar) IS
  'Returns the applicable tax rate for a location, cascading zip → city → state → 8% default.';

GRANT EXECUTE ON FUNCTION get_tax_rate_for_location(varchar, varchar, varchar)
  TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION 12: get_tax_rate_details — read helper, table return
-- ═══════════════════════════════════════════════════════════════════════════
-- Same cascade as get_tax_rate_for_location but returns full context
-- (rate, name, level, source, expiry) so the PO UI can show "Austin Combined
-- Tax · sourced from Avalara · valid until 2026-08-01".

CREATE OR REPLACE FUNCTION get_tax_rate_details(
  p_state    varchar(2),
  p_city     varchar(100) DEFAULT NULL,
  p_zip_code varchar(20)  DEFAULT NULL
)
RETURNS TABLE (
  tax_rate    numeric(5,4),
  tax_name    varchar(200),
  tax_level   varchar(20),
  source      varchar(20),
  expires_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_zip_code IS NOT NULL THEN
    RETURN QUERY
    SELECT tr.tax_rate, tr.tax_name, 'zip_code'::varchar(20),
           tr.source, tr.expires_at
      FROM tax_rates tr
     WHERE tr.state = p_state
       AND tr.zip_code = p_zip_code
       AND tr.is_active = true
       AND tr.deleted_at IS NULL
     LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF p_city IS NOT NULL THEN
    RETURN QUERY
    SELECT tr.tax_rate, tr.tax_name, 'city'::varchar(20),
           tr.source, tr.expires_at
      FROM tax_rates tr
     WHERE tr.state = p_state
       AND tr.city = p_city
       AND tr.zip_code IS NULL
       AND tr.is_active = true
       AND tr.deleted_at IS NULL
     LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT tr.tax_rate, tr.tax_name, 'state'::varchar(20),
         tr.source, tr.expires_at
    FROM tax_rates tr
   WHERE tr.state = p_state
     AND tr.city IS NULL
     AND tr.zip_code IS NULL
     AND tr.is_active = true
     AND tr.deleted_at IS NULL
   LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- Default fallback
  RETURN QUERY
  SELECT 0.08::numeric(5,4),
         'Default Tax Rate'::varchar(200),
         'default'::varchar(20),
         'default'::varchar(20),
         NULL::timestamptz;
END;
$$;

COMMENT ON FUNCTION get_tax_rate_details(varchar, varchar, varchar) IS
  'Returns the applicable tax rate plus full context (name, level, source, expiry) for the PO UI.';

GRANT EXECUTE ON FUNCTION get_tax_rate_details(varchar, varchar, varchar)
  TO authenticated;
