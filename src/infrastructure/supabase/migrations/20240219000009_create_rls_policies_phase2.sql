-- Enable RLS on all Phase 2 tables
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE reorder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- SUPPLIERS POLICIES

-- Allow all operations for authenticated users (shop floor workers need full access)
CREATE POLICY "suppliers_select_policy"
  ON suppliers FOR SELECT
  USING (true);

CREATE POLICY "suppliers_insert_policy"
  ON suppliers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "suppliers_update_policy"
  ON suppliers FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "suppliers_delete_policy"
  ON suppliers FOR DELETE
  USING (true);

-- MATERIAL_SUPPLIERS POLICIES

CREATE POLICY "material_suppliers_select_policy"
  ON material_suppliers FOR SELECT
  USING (true);

CREATE POLICY "material_suppliers_insert_policy"
  ON material_suppliers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "material_suppliers_update_policy"
  ON material_suppliers FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "material_suppliers_delete_policy"
  ON material_suppliers FOR DELETE
  USING (true);

-- PRICE_HISTORY POLICIES

-- Price history is immutable - allow read and insert only
CREATE POLICY "price_history_select_policy"
  ON price_history FOR SELECT
  USING (true);

CREATE POLICY "price_history_insert_policy"
  ON price_history FOR INSERT
  WITH CHECK (true);

-- Allow updates only within 1 hour (for error corrections)
-- Note: Using stable function instead of NOW() to avoid immutability issues
CREATE POLICY "price_history_update_policy"
  ON price_history FOR UPDATE
  USING (created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour')
  WITH CHECK (created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour');

-- No delete policy for price history (audit trail)

-- REORDER_RULES POLICIES

CREATE POLICY "reorder_rules_select_policy"
  ON reorder_rules FOR SELECT
  USING (true);

CREATE POLICY "reorder_rules_insert_policy"
  ON reorder_rules FOR INSERT
  WITH CHECK (true);

CREATE POLICY "reorder_rules_update_policy"
  ON reorder_rules FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "reorder_rules_delete_policy"
  ON reorder_rules FOR DELETE
  USING (true);

-- PURCHASE_ORDERS POLICIES

CREATE POLICY "purchase_orders_select_policy"
  ON purchase_orders FOR SELECT
  USING (true);

CREATE POLICY "purchase_orders_insert_policy"
  ON purchase_orders FOR INSERT
  WITH CHECK (true);

-- Allow updates unless PO is in 'received' or 'cancelled' status
CREATE POLICY "purchase_orders_update_policy"
  ON purchase_orders FOR UPDATE
  USING (status NOT IN ('received', 'cancelled'))
  WITH CHECK (status NOT IN ('received', 'cancelled'));

-- Allow deletion only for draft POs
CREATE POLICY "purchase_orders_delete_policy"
  ON purchase_orders FOR DELETE
  USING (status = 'draft');

-- PURCHASE_ORDER_ITEMS POLICIES

CREATE POLICY "purchase_order_items_select_policy"
  ON purchase_order_items FOR SELECT
  USING (true);

CREATE POLICY "purchase_order_items_insert_policy"
  ON purchase_order_items FOR INSERT
  WITH CHECK (true);

-- Allow updates only if parent PO is not received or cancelled
CREATE POLICY "purchase_order_items_update_policy"
  ON purchase_order_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_id
        AND po.status NOT IN ('received', 'cancelled')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_id
        AND po.status NOT IN ('received', 'cancelled')
    )
  );

-- Allow deletion only if parent PO is draft
CREATE POLICY "purchase_order_items_delete_policy"
  ON purchase_order_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_id
        AND po.status = 'draft'
    )
  );

-- NOTIFICATION_PREFERENCES POLICIES

-- Users should only see their own preferences
-- Note: In a real implementation, this would use auth.uid() or similar
-- For now, using permissive policies as per existing pattern
CREATE POLICY "notification_preferences_select_policy"
  ON notification_preferences FOR SELECT
  USING (true);

CREATE POLICY "notification_preferences_insert_policy"
  ON notification_preferences FOR INSERT
  WITH CHECK (true);

CREATE POLICY "notification_preferences_update_policy"
  ON notification_preferences FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "notification_preferences_delete_policy"
  ON notification_preferences FOR DELETE
  USING (true);

-- NOTIFICATION_QUEUE POLICIES

-- Notifications should be readable by all (for admin purposes)
-- but only system processes should modify them
CREATE POLICY "notification_queue_select_policy"
  ON notification_queue FOR SELECT
  USING (true);

CREATE POLICY "notification_queue_insert_policy"
  ON notification_queue FOR INSERT
  WITH CHECK (true);

CREATE POLICY "notification_queue_update_policy"
  ON notification_queue FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow deletion only for sent/cancelled notifications older than 7 days
-- Note: Using stable function instead of NOW() to avoid immutability issues
CREATE POLICY "notification_queue_delete_policy"
  ON notification_queue FOR DELETE
  USING (
    status IN ('sent', 'cancelled')
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
  );

-- POLICY COMMENTS

COMMENT ON POLICY "suppliers_select_policy" ON suppliers IS 'Allows all users to view supplier information';
COMMENT ON POLICY "material_suppliers_select_policy" ON material_suppliers IS 'Allows all users to view material-supplier relationships';
COMMENT ON POLICY "price_history_select_policy" ON price_history IS 'Allows all users to view price history';
COMMENT ON POLICY "price_history_update_policy" ON price_history IS 'Allows price corrections within 1 hour of creation';
COMMENT ON POLICY "reorder_rules_select_policy" ON reorder_rules IS 'Allows all users to view reorder rules';
COMMENT ON POLICY "purchase_orders_select_policy" ON purchase_orders IS 'Allows all users to view purchase orders';
COMMENT ON POLICY "purchase_orders_update_policy" ON purchase_orders IS 'Prevents updates to received or cancelled POs';
COMMENT ON POLICY "purchase_orders_delete_policy" ON purchase_orders IS 'Only allows deletion of draft POs';
COMMENT ON POLICY "purchase_order_items_update_policy" ON purchase_order_items IS 'Prevents updates when parent PO is finalized';
COMMENT ON POLICY "notification_queue_delete_policy" ON notification_queue IS 'Only allows cleanup of old processed notifications';

-- Note: In production, these policies should be refined to use proper authentication
-- Example patterns for future enhancement:
-- USING (auth.uid() IS NOT NULL) for authenticated users only
-- USING (auth.jwt() ->> 'role' = 'admin') for admin-only operations
-- USING (auth.jwt() ->> 'email' = user_identifier) for user-specific data