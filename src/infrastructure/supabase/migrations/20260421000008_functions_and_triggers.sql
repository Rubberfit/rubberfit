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
