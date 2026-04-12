-- Composite indexes

-- Index for finding best supplier prices by material
CREATE INDEX IF NOT EXISTS idx_material_suppliers_best_price
  ON material_suppliers(material_type_id, active, preferred_supplier DESC, cost_per_sqft)
  WHERE active = true;

-- Index for price trend analysis
CREATE INDEX IF NOT EXISTS idx_price_history_trends
  ON price_history(material_supplier_id, effective_date DESC, new_cost_per_sqft);

-- Index for reorder rule evaluation (check inventory levels)
CREATE INDEX IF NOT EXISTS idx_reorder_rules_evaluation
  ON reorder_rules(active, material_type_id, reorder_point)
  WHERE active = true;

-- Index for PO approval workflow
CREATE INDEX IF NOT EXISTS idx_purchase_orders_approval_workflow
  ON purchase_orders(status, created_at, total_amount DESC)
  WHERE status IN ('pending', 'draft');

-- Index for delivery tracking
CREATE INDEX IF NOT EXISTS idx_purchase_orders_delivery_tracking
  ON purchase_orders(supplier_id, requested_delivery_date, status)
  WHERE status IN ('ordered', 'approved') AND requested_delivery_date IS NOT NULL;

-- Partial indexes

-- Active suppliers only (most queries filter by active status)
CREATE INDEX IF NOT EXISTS idx_suppliers_active_preferred
  ON suppliers(preferred DESC, rating DESC, name)
  WHERE active = true;

-- Pending notifications (most frequent query for processing)
CREATE INDEX IF NOT EXISTS idx_notification_queue_pending
  ON notification_queue(priority DESC, scheduled_for)
  WHERE status = 'pending';

-- Failed notifications eligible for retry
CREATE INDEX IF NOT EXISTS idx_notification_queue_retry_eligible
  ON notification_queue(next_retry_at, retry_count)
  WHERE status = 'failed' AND retry_count < max_retries;

-- Current effective pricing (simplified without date functions)
CREATE INDEX IF NOT EXISTS idx_material_suppliers_current_pricing
  ON material_suppliers(material_type_id, cost_per_sqft, effective_date, expiration_date)
  WHERE active = true;

-- Functional indexes

-- Index on PO number for better searches
-- Simplified to avoid expression index issues
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_year
  ON purchase_orders(po_number);

-- Index for notification scheduling
-- Note: Removed timezone expression for compatibility
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled_utc
  ON notification_queue(scheduled_for)
  WHERE status = 'pending';

-- Covering indexes

-- Cover common supplier lookup queries
CREATE INDEX IF NOT EXISTS idx_suppliers_lookup_covering
  ON suppliers(id, name, active, preferred, rating, contact_person, email, phone)
  WHERE active = true;

-- Cover material-supplier relationship queries
CREATE INDEX IF NOT EXISTS idx_material_suppliers_relationship_covering
  ON material_suppliers(material_type_id, supplier_id, cost_per_sqft, lead_time_days, active, preferred_supplier);

-- Cover PO summary queries
CREATE INDEX IF NOT EXISTS idx_purchase_orders_summary_covering
  ON purchase_orders(id, po_number, supplier_id, status, order_date, total_amount, requested_delivery_date);

-- Maintenance indexes

-- Index for notification cleanup operations
CREATE INDEX IF NOT EXISTS idx_notification_queue_cleanup
  ON notification_queue(status, created_at)
  WHERE status IN ('sent', 'cancelled', 'failed');

-- Index for price history archival
-- Simplified index for archival queries (removed immutable function)
CREATE INDEX IF NOT EXISTS idx_price_history_archival
  ON price_history(created_at);

-- Statistics indexes

-- Index for supplier performance analysis
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_performance
  ON purchase_orders(supplier_id, status, order_date, actual_delivery_date, requested_delivery_date)
  WHERE status = 'received';

-- Index for cost analysis and budgeting
-- Simplified without date extraction functions
CREATE INDEX IF NOT EXISTS idx_purchase_orders_cost_analysis
  ON purchase_orders(order_date, status, total_amount)
  WHERE status IN ('approved', 'ordered', 'received');

-- Index for material usage patterns
-- Simplified without date extraction functions
CREATE INDEX IF NOT EXISTS idx_po_items_material_usage
  ON purchase_order_items(material_type_id, created_at, quantity_sqft);

-- Concurrency optimization

-- Reduce lock contention on high-frequency updates
CREATE INDEX IF NOT EXISTS idx_reorder_rules_concurrent_updates
  ON reorder_rules(id, material_type_id)
  WHERE active = true;

-- Optimize notification queue processing with minimal locking
CREATE INDEX IF NOT EXISTS idx_notification_queue_concurrent_processing
  ON notification_queue(id, status, scheduled_for)
  WHERE status IN ('pending', 'processing');

-- Query optimization

-- Statistics targets
ALTER TABLE suppliers ALTER COLUMN rating SET STATISTICS 1000;
ALTER TABLE material_suppliers ALTER COLUMN cost_per_sqft SET STATISTICS 1000;
ALTER TABLE purchase_orders ALTER COLUMN total_amount SET STATISTICS 1000;
ALTER TABLE notification_queue ALTER COLUMN scheduled_for SET STATISTICS 1000;

