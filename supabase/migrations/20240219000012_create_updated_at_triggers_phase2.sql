CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE updated_at triggers for all Phase 2 tables with updated_at columns

-- Suppliers table
CREATE TRIGGER trigger_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Material suppliers table
CREATE TRIGGER trigger_material_suppliers_updated_at
  BEFORE UPDATE ON material_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Reorder rules table
CREATE TRIGGER trigger_reorder_rules_updated_at
  BEFORE UPDATE ON reorder_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Purchase orders table
CREATE TRIGGER trigger_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Purchase order items table
CREATE TRIGGER trigger_purchase_order_items_updated_at
  BEFORE UPDATE ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Notification preferences table
CREATE TRIGGER trigger_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Notification queue table
CREATE TRIGGER trigger_notification_queue_updated_at
  BEFORE UPDATE ON notification_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ADD trigger comments for documentation
COMMENT ON TRIGGER trigger_suppliers_updated_at ON suppliers IS 'Automatically updates updated_at timestamp on row modification';
COMMENT ON TRIGGER trigger_material_suppliers_updated_at ON material_suppliers IS 'Automatically updates updated_at timestamp on row modification';
COMMENT ON TRIGGER trigger_reorder_rules_updated_at ON reorder_rules IS 'Automatically updates updated_at timestamp on row modification';
COMMENT ON TRIGGER trigger_purchase_orders_updated_at ON purchase_orders IS 'Automatically updates updated_at timestamp on row modification';
COMMENT ON TRIGGER trigger_purchase_order_items_updated_at ON purchase_order_items IS 'Automatically updates updated_at timestamp on row modification';
COMMENT ON TRIGGER trigger_notification_preferences_updated_at ON notification_preferences IS 'Automatically updates updated_at timestamp on row modification';
COMMENT ON TRIGGER trigger_notification_queue_updated_at ON notification_queue IS 'Automatically updates updated_at timestamp on row modification';

CREATE a function to validate trigger installation
CREATE OR REPLACE FUNCTION validate_phase2_triggers()
RETURNS TABLE(
  table_name TEXT,
  trigger_name TEXT,
  trigger_exists BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.table_name::TEXT,
    t.expected_trigger::TEXT,
    (
      SELECT COUNT(*) > 0
      FROM information_schema.triggers ist
      WHERE ist.event_object_table = t.table_name
        AND ist.trigger_name = t.expected_trigger
    ) as trigger_exists
  FROM (VALUES
    ('suppliers', 'trigger_suppliers_updated_at'),
    ('material_suppliers', 'trigger_material_suppliers_updated_at'),
    ('reorder_rules', 'trigger_reorder_rules_updated_at'),
    ('purchase_orders', 'trigger_purchase_orders_updated_at'),
    ('purchase_order_items', 'trigger_purchase_order_items_updated_at'),
    ('notification_preferences', 'trigger_notification_preferences_updated_at'),
    ('notification_queue', 'trigger_notification_queue_updated_at')
  ) as t(table_name, expected_trigger);
END;
$$ LANGUAGE plpgsql;

-- Run validation and display results
SELECT * FROM validate_phase2_triggers();