-- ============================================================
-- Migration: Add user_id to all data tables + Fix RLS policies
-- Purpose: Enable per-user data isolation so each user only
--          sees their own data.
-- ============================================================

BEGIN;

-- ============================================================
-- 1a. Add user_id column to ALL data tables (11 tables)
--     DEFAULT auth.uid() means rows created via Supabase client
--     automatically get the current user's ID.
-- ============================================================

ALTER TABLE material_types
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE rolls
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE cuts
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE material_suppliers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE reorder_rules
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- ============================================================
-- 1b. Delete orphaned test/sample data (rows with NULL user_id)
--     These came from 20240219000013_insert_sample_data_phase2.sql
--     and have no real owner.
-- ============================================================

-- Delete in dependency order (children first)
DELETE FROM purchase_order_items WHERE user_id IS NULL;
DELETE FROM purchase_orders WHERE user_id IS NULL;
DELETE FROM notification_queue WHERE user_id IS NULL;
DELETE FROM notification_preferences WHERE user_id IS NULL;
DELETE FROM price_history WHERE user_id IS NULL;
DELETE FROM reorder_rules WHERE user_id IS NULL;
DELETE FROM material_suppliers WHERE user_id IS NULL;
DELETE FROM cuts WHERE user_id IS NULL;
DELETE FROM notifications WHERE user_id IS NULL;
DELETE FROM rolls WHERE user_id IS NULL;
DELETE FROM suppliers WHERE user_id IS NULL;
DELETE FROM material_types WHERE user_id IS NULL;

-- ============================================================
-- 1c. Make user_id NOT NULL after cleanup
-- ============================================================

ALTER TABLE material_types ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE rolls ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE cuts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE material_suppliers ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE price_history ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE reorder_rules ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE purchase_orders ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE purchase_order_items ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE notification_preferences ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE notification_queue ALTER COLUMN user_id SET NOT NULL;

-- ============================================================
-- 1d. Add indexes for user_id lookups
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_material_types_user_id ON material_types(user_id);
CREATE INDEX IF NOT EXISTS idx_rolls_user_id ON rolls(user_id);
CREATE INDEX IF NOT EXISTS idx_cuts_user_id ON cuts(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_user_id ON suppliers(user_id);
CREATE INDEX IF NOT EXISTS idx_material_suppliers_user_id ON material_suppliers(user_id);
CREATE INDEX IF NOT EXISTS idx_price_history_user_id ON price_history(user_id);
CREATE INDEX IF NOT EXISTS idx_reorder_rules_user_id ON reorder_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_user_id ON purchase_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_user_id ON purchase_order_items(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_user_id ON notification_queue(user_id);

-- ============================================================
-- 1e. Drop ALL old permissive RLS policies
--     From Phase 1 (20240217000007) and Phase 2 (20240219000009)
-- ============================================================

-- Phase 1 policies
DROP POLICY IF EXISTS "material_types_select_policy" ON material_types;
DROP POLICY IF EXISTS "material_types_insert_policy" ON material_types;
DROP POLICY IF EXISTS "material_types_update_policy" ON material_types;
DROP POLICY IF EXISTS "material_types_delete_policy" ON material_types;

DROP POLICY IF EXISTS "rolls_select_policy" ON rolls;
DROP POLICY IF EXISTS "rolls_insert_policy" ON rolls;
DROP POLICY IF EXISTS "rolls_update_policy" ON rolls;
DROP POLICY IF EXISTS "rolls_delete_policy" ON rolls;

DROP POLICY IF EXISTS "cuts_select_policy" ON cuts;
DROP POLICY IF EXISTS "cuts_insert_policy" ON cuts;
DROP POLICY IF EXISTS "cuts_update_policy" ON cuts;

DROP POLICY IF EXISTS "notifications_select_policy" ON notifications;
DROP POLICY IF EXISTS "notifications_insert_policy" ON notifications;
DROP POLICY IF EXISTS "notifications_update_policy" ON notifications;
DROP POLICY IF EXISTS "notifications_delete_policy" ON notifications;

-- Phase 2 policies
DROP POLICY IF EXISTS "suppliers_select_policy" ON suppliers;
DROP POLICY IF EXISTS "suppliers_insert_policy" ON suppliers;
DROP POLICY IF EXISTS "suppliers_update_policy" ON suppliers;
DROP POLICY IF EXISTS "suppliers_delete_policy" ON suppliers;

DROP POLICY IF EXISTS "material_suppliers_select_policy" ON material_suppliers;
DROP POLICY IF EXISTS "material_suppliers_insert_policy" ON material_suppliers;
DROP POLICY IF EXISTS "material_suppliers_update_policy" ON material_suppliers;
DROP POLICY IF EXISTS "material_suppliers_delete_policy" ON material_suppliers;

DROP POLICY IF EXISTS "price_history_select_policy" ON price_history;
DROP POLICY IF EXISTS "price_history_insert_policy" ON price_history;
DROP POLICY IF EXISTS "price_history_update_policy" ON price_history;

DROP POLICY IF EXISTS "reorder_rules_select_policy" ON reorder_rules;
DROP POLICY IF EXISTS "reorder_rules_insert_policy" ON reorder_rules;
DROP POLICY IF EXISTS "reorder_rules_update_policy" ON reorder_rules;
DROP POLICY IF EXISTS "reorder_rules_delete_policy" ON reorder_rules;

DROP POLICY IF EXISTS "purchase_orders_select_policy" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_insert_policy" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_update_policy" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_delete_policy" ON purchase_orders;

DROP POLICY IF EXISTS "purchase_order_items_select_policy" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_insert_policy" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_update_policy" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_delete_policy" ON purchase_order_items;

DROP POLICY IF EXISTS "notification_preferences_select_policy" ON notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_insert_policy" ON notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_update_policy" ON notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_delete_policy" ON notification_preferences;

DROP POLICY IF EXISTS "notification_queue_select_policy" ON notification_queue;
DROP POLICY IF EXISTS "notification_queue_insert_policy" ON notification_queue;
DROP POLICY IF EXISTS "notification_queue_update_policy" ON notification_queue;
DROP POLICY IF EXISTS "notification_queue_delete_policy" ON notification_queue;

-- ============================================================
-- 1f. Create new user-scoped RLS policies
--     Every policy now uses auth.uid() = user_id
--     Business rules from the old policies are preserved.
-- ============================================================

-- ==================== MATERIAL_TYPES ====================

CREATE POLICY "material_types_select"
  ON material_types FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "material_types_insert"
  ON material_types FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "material_types_update"
  ON material_types FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "material_types_delete"
  ON material_types FOR DELETE
  USING (auth.uid() = user_id);

-- ==================== ROLLS ====================

CREATE POLICY "rolls_select"
  ON rolls FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "rolls_insert"
  ON rolls FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rolls_update"
  ON rolls FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rolls_delete"
  ON rolls FOR DELETE
  USING (auth.uid() = user_id);

-- ==================== CUTS ====================
-- Preserves: 24-hour edit window

CREATE POLICY "cuts_select"
  ON cuts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "cuts_insert"
  ON cuts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cuts_update"
  ON cuts FOR UPDATE
  USING (auth.uid() = user_id AND created_at > NOW() - INTERVAL '24 hours')
  WITH CHECK (auth.uid() = user_id AND created_at > NOW() - INTERVAL '24 hours');

-- No delete policy for cuts (historical integrity)

-- ==================== NOTIFICATIONS ====================

CREATE POLICY "notifications_select"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_update"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_delete"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- ==================== SUPPLIERS ====================

CREATE POLICY "suppliers_select"
  ON suppliers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "suppliers_insert"
  ON suppliers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "suppliers_update"
  ON suppliers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "suppliers_delete"
  ON suppliers FOR DELETE
  USING (auth.uid() = user_id);

-- ==================== MATERIAL_SUPPLIERS ====================

CREATE POLICY "material_suppliers_select"
  ON material_suppliers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "material_suppliers_insert"
  ON material_suppliers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "material_suppliers_update"
  ON material_suppliers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "material_suppliers_delete"
  ON material_suppliers FOR DELETE
  USING (auth.uid() = user_id);

-- ==================== PRICE_HISTORY ====================
-- Preserves: 1-hour correction window, no deletes

CREATE POLICY "price_history_select"
  ON price_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "price_history_insert"
  ON price_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "price_history_update"
  ON price_history FOR UPDATE
  USING (auth.uid() = user_id AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour')
  WITH CHECK (auth.uid() = user_id AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour');

-- No delete policy for price_history (audit trail)

-- ==================== REORDER_RULES ====================

CREATE POLICY "reorder_rules_select"
  ON reorder_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "reorder_rules_insert"
  ON reorder_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reorder_rules_update"
  ON reorder_rules FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reorder_rules_delete"
  ON reorder_rules FOR DELETE
  USING (auth.uid() = user_id);

-- ==================== PURCHASE_ORDERS ====================
-- Preserves: status-based restrictions on updates/deletes

CREATE POLICY "purchase_orders_select"
  ON purchase_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "purchase_orders_insert"
  ON purchase_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "purchase_orders_update"
  ON purchase_orders FOR UPDATE
  USING (auth.uid() = user_id AND status NOT IN ('received', 'cancelled'))
  WITH CHECK (auth.uid() = user_id AND status NOT IN ('received', 'cancelled'));

CREATE POLICY "purchase_orders_delete"
  ON purchase_orders FOR DELETE
  USING (auth.uid() = user_id AND status = 'draft');

-- ==================== PURCHASE_ORDER_ITEMS ====================
-- Preserves: PO-status-based restrictions

CREATE POLICY "purchase_order_items_select"
  ON purchase_order_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "purchase_order_items_insert"
  ON purchase_order_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "purchase_order_items_update"
  ON purchase_order_items FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_id
        AND po.status NOT IN ('received', 'cancelled')
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_id
        AND po.status NOT IN ('received', 'cancelled')
    )
  );

CREATE POLICY "purchase_order_items_delete"
  ON purchase_order_items FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_id
        AND po.status = 'draft'
    )
  );

-- ==================== NOTIFICATION_PREFERENCES ====================

CREATE POLICY "notification_preferences_select"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notification_preferences_insert"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notification_preferences_update"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notification_preferences_delete"
  ON notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- ==================== NOTIFICATION_QUEUE ====================
-- Preserves: 7-day cleanup window for deletes

CREATE POLICY "notification_queue_select"
  ON notification_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notification_queue_insert"
  ON notification_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notification_queue_update"
  ON notification_queue FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notification_queue_delete"
  ON notification_queue FOR DELETE
  USING (
    auth.uid() = user_id
    AND status IN ('sent', 'cancelled')
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
  );

-- ============================================================
-- 1g. TAX_RATES — shared reference data, no user_id needed
--     Just require authentication to read.
-- ============================================================

ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_rates_select"
  ON tax_rates FOR SELECT
  USING (auth.uid() IS NOT NULL);

COMMIT;
