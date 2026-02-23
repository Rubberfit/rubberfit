-- Suppliers sample data

INSERT INTO suppliers (
  id,
  name,
  contact_person,
  email,
  phone,
  address,
  city,
  state,
  zip_code,
  payment_terms,
  rating,
  preferred,
  active
) VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Premium Rubber Supply Co.',
    'John Anderson',
    'john.anderson@premiumrubber.com',
    '+1-800-555-0101',
    '1234 Industrial Blvd',
    'Cleveland',
    'OH',
    '44101',
    'Net 30',
    4.5,
    true,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Midwest Materials Inc.',
    'Sarah Chen',
    'sarah.chen@midwestmaterials.com',
    '+1-800-555-0102',
    '5678 Manufacturing Ave',
    'Chicago',
    'IL',
    '60601',
    '2/10 Net 30',
    4.0,
    true,
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Budget Rubber Warehouse',
    'Mike Rodriguez',
    'mike@budgetrubber.com',
    '+1-800-555-0103',
    '9012 Warehouse Way',
    'Detroit',
    'MI',
    '48201',
    'Net 45',
    3.5,
    false,
    true
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'Specialty Elastomers Ltd.',
    'Dr. Emily Watson',
    'emily.watson@specialtyelastomers.com',
    '+1-800-555-0104',
    '3456 Research Parkway',
    'Akron',
    'OH',
    '44301',
    'Net 30',
    4.8,
    true,
    true
  )
ON CONFLICT (name) DO UPDATE SET
  contact_person = EXCLUDED.contact_person,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  rating = EXCLUDED.rating,
  preferred = EXCLUDED.preferred,
  updated_at = NOW();

-- Material-supplier relationships

-- Get material_type IDs from existing data
-- Note: These will need to match actual material_types from Phase 1

WITH material_mapping AS (
  SELECT id, name FROM material_types LIMIT 10
)
INSERT INTO material_suppliers (
  material_type_id,
  supplier_id,
  supplier_material_code,
  cost_per_sqft,
  minimum_order_sqft,
  lead_time_days,
  preferred_supplier,
  effective_date
)
SELECT
  mt.id,
  '11111111-1111-1111-1111-111111111111', -- Premium Rubber Supply
  'PRS-' || UPPER(SUBSTRING(mt.name FROM 1 FOR 3)) || '-001',
  CASE
    WHEN LOWER(mt.name) LIKE '%neoprene%' THEN 12.50
    WHEN LOWER(mt.name) LIKE '%epdm%' THEN 8.75
    WHEN LOWER(mt.name) LIKE '%silicone%' THEN 15.25
    WHEN LOWER(mt.name) LIKE '%viton%' THEN 28.50
    ELSE 10.00
  END,
  500.0,
  7,
  true,
  CURRENT_DATE - INTERVAL '30 days'
FROM material_types mt
ON CONFLICT (material_type_id, supplier_id) DO UPDATE SET
  cost_per_sqft = EXCLUDED.cost_per_sqft,
  updated_at = NOW();

-- Add second supplier relationships
INSERT INTO material_suppliers (
  material_type_id,
  supplier_id,
  supplier_material_code,
  cost_per_sqft,
  minimum_order_sqft,
  lead_time_days,
  preferred_supplier,
  effective_date
)
SELECT
  mt.id,
  '22222222-2222-2222-2222-222222222222', -- Midwest Materials
  'MMI-' || UPPER(SUBSTRING(mt.name FROM 1 FOR 3)) || '-002',
  CASE
    WHEN LOWER(mt.name) LIKE '%neoprene%' THEN 11.75
    WHEN LOWER(mt.name) LIKE '%epdm%' THEN 8.25
    WHEN LOWER(mt.name) LIKE '%silicone%' THEN 14.50
    WHEN LOWER(mt.name) LIKE '%viton%' THEN 26.75
    ELSE 9.50
  END,
  750.0,
  10,
  false,
  CURRENT_DATE - INTERVAL '60 days'
FROM material_types mt
LIMIT 3
ON CONFLICT (material_type_id, supplier_id) DO NOTHING;

-- Reorder rules

INSERT INTO reorder_rules (
  material_type_id,
  supplier_id,
  reorder_point,
  reorder_quantity,
  max_stock_level,
  lead_time_days,
  safety_stock_days,
  auto_reorder,
  active
)
SELECT
  mt.id,
  '11111111-1111-1111-1111-111111111111',
  CASE
    WHEN LOWER(mt.name) LIKE '%neoprene%' THEN 500.0
    WHEN LOWER(mt.name) LIKE '%epdm%' THEN 750.0
    ELSE 600.0
  END,
  CASE
    WHEN LOWER(mt.name) LIKE '%neoprene%' THEN 1500.0
    WHEN LOWER(mt.name) LIKE '%epdm%' THEN 2000.0
    ELSE 1000.0
  END,
  CASE
    WHEN LOWER(mt.name) LIKE '%neoprene%' THEN 3000.0
    WHEN LOWER(mt.name) LIKE '%epdm%' THEN 4000.0
    ELSE 2500.0
  END,
  7,
  3,
  true,
  true
FROM material_types mt
LIMIT 5
ON CONFLICT (material_type_id) DO UPDATE SET
  reorder_point = EXCLUDED.reorder_point,
  reorder_quantity = EXCLUDED.reorder_quantity,
  auto_reorder = EXCLUDED.auto_reorder,
  updated_at = NOW();

-- Notification preferences

INSERT INTO notification_preferences (
  user_identifier,
  email,
  phone,
  email_enabled,
  sms_enabled,
  low_stock_enabled,
  reorder_triggered_enabled,
  po_created_enabled,
  delivery_expected_enabled,
  delivery_overdue_enabled,
  price_change_enabled,
  price_change_threshold,
  timezone
) VALUES
  (
    'shop.manager@usimanufacturing.com',
    'shop.manager@usimanufacturing.com',
    '+1-555-0201',
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    5.0,
    'America/New_York'
  ),
  (
    'inventory.clerk@usimanufacturing.com',
    'inventory.clerk@usimanufacturing.com',
    '+1-555-0202',
    true,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    10.0,
    'America/New_York'
  ),
  (
    'purchasing@usimanufacturing.com',
    'purchasing@usimanufacturing.com',
    '+1-555-0203',
    true,
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    3.0,
    'America/New_York'
  )
ON CONFLICT (user_identifier) DO UPDATE SET
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  email_enabled = EXCLUDED.email_enabled,
  sms_enabled = EXCLUDED.sms_enabled,
  updated_at = NOW();

-- Purchase orders

-- Create sample POs
INSERT INTO purchase_orders (
  id,
  po_number,
  supplier_id,
  status,
  order_date,
  requested_delivery_date,
  approved_by,
  approved_at,
  subtotal,
  total_amount,
  payment_terms,
  created_by,
  auto_generated
) VALUES
  (
    'a1111111-1111-1111-1111-111111111111',
    'PO-24-0001',
    '11111111-1111-1111-1111-111111111111',
    'approved',
    CURRENT_DATE - INTERVAL '5 days',
    CURRENT_DATE + INTERVAL '10 days',
    'shop.manager@usimanufacturing.com',
    CURRENT_DATE - INTERVAL '4 days',
    2500.00,
    2500.00,
    'Net 30',
    'shop.manager@usimanufacturing.com',
    false
  ),
  (
    'a2222222-2222-2222-2222-222222222222',
    'PO-24-0002',
    '22222222-2222-2222-2222-222222222222',
    'draft',
    NULL,
    NULL,
    NULL,
    NULL,
    1875.00,
    1875.00,
    '2/10 Net 30',
    'purchasing@usimanufacturing.com',
    true
  )
ON CONFLICT (po_number) DO UPDATE SET
  status = EXCLUDED.status,
  subtotal = EXCLUDED.subtotal,
  total_amount = EXCLUDED.total_amount,
  updated_at = NOW();

-- Create PO line items
INSERT INTO purchase_order_items (
  purchase_order_id,
  material_type_id,
  line_number,
  description,
  quantity_sqft,
  unit_cost
)
SELECT
  'a1111111-1111-1111-1111-111111111111',
  mt.id,
  1,
  'Standard roll - ' || mt.name,
  200.0,
  12.50
FROM material_types mt
LIMIT 1
ON CONFLICT (purchase_order_id, line_number) DO UPDATE SET
  quantity_sqft = EXCLUDED.quantity_sqft,
  unit_cost = EXCLUDED.unit_cost,
  updated_at = NOW();

-- Price history

-- Create price history entries
INSERT INTO price_history (
  material_supplier_id,
  old_cost_per_sqft,
  new_cost_per_sqft,
  change_reason,
  effective_date,
  changed_by
)
SELECT
  ms.id,
  ms.cost_per_sqft - 1.25, -- Simulate previous price
  ms.cost_per_sqft,
  'Market adjustment',
  CURRENT_DATE - INTERVAL '30 days',
  'system'
FROM material_suppliers ms
LIMIT 3;

-- Add recent price change
INSERT INTO price_history (
  material_supplier_id,
  old_cost_per_sqft,
  new_cost_per_sqft,
  change_reason,
  effective_date,
  changed_by
)
SELECT
  ms.id,
  ms.cost_per_sqft,
  ms.cost_per_sqft + 0.75, -- Simulate price increase
  'Raw material cost increase',
  CURRENT_DATE - INTERVAL '3 days',
  'purchasing@usimanufacturing.com'
FROM material_suppliers ms
WHERE ms.preferred_supplier = true
LIMIT 1;

-- Sample notifications

-- Create sample notifications
INSERT INTO notification_queue (
  user_identifier,
  notification_type,
  title,
  message,
  send_email,
  send_sms,
  priority,
  status,
  context_data
) VALUES
  (
    'shop.manager@usimanufacturing.com',
    'low_stock',
    'Low Stock Alert: Neoprene',
    'Neoprene stock has reached reorder point. Current: 450 sqft, Reorder point: 500 sqft',
    true,
    true,
    'high',
    'pending',
    '{"material_type_id": "example", "current_stock": 450, "reorder_point": 500}'::jsonb
  ),
  (
    'purchasing@usimanufacturing.com',
    'po_created',
    'Purchase Order Created: PO-24-0002',
    'New purchase order has been created and requires approval.',
    true,
    false,
    'normal',
    'sent',
    '{"po_id": "a2222222-2222-2222-2222-222222222222", "auto_generated": true}'::jsonb
  );