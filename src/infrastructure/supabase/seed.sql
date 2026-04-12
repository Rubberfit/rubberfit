-- =============================================================
-- seed.sql — Local development seed data
-- Run via: supabase db reset (applies migrations then this file)
--
-- Creates 4 test users with different roles, then populates all
-- data tables (material_types, rolls, cuts, suppliers, etc.)
-- scoped to the admin user so the app has something to display.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Auth users (local Supabase only — never run in production)
--    Password for all test accounts: Password123!
-- ─────────────────────────────────────────────────────────────

INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
) VALUES
  (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'admin@rema.dev',
    crypt('Password123!', gen_salt('bf')),
    NOW(),
    '{"full_name": "Admin User"}'::jsonb,
    NOW(), NOW(), 'authenticated', 'authenticated'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000002',
    'manager@rema.dev',
    crypt('Password123!', gen_salt('bf')),
    NOW(),
    '{"full_name": "Manager User"}'::jsonb,
    NOW(), NOW(), 'authenticated', 'authenticated'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000003',
    'cutter@rema.dev',
    crypt('Password123!', gen_salt('bf')),
    NOW(),
    '{"full_name": "Cutter User"}'::jsonb,
    NOW(), NOW(), 'authenticated', 'authenticated'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000004',
    'viewer@rema.dev',
    crypt('Password123!', gen_salt('bf')),
    NOW(),
    '{"full_name": "Viewer User"}'::jsonb,
    NOW(), NOW(), 'authenticated', 'authenticated'
  )
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. Profiles — handle_new_user trigger runs on auth.users
--    INSERT, so profiles are already created. Just set roles.
-- ─────────────────────────────────────────────────────────────

UPDATE profiles SET roles = ARRAY['admin']      WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE profiles SET roles = ARRAY['manager']    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
UPDATE profiles SET roles = ARRAY['cutter']     WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';
UPDATE profiles SET roles = ARRAY['viewer']     WHERE id = 'aaaaaaaa-0000-0000-0000-000000000004';

-- ─────────────────────────────────────────────────────────────
-- All remaining data is owned by the admin user.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_uid         UUID := 'aaaaaaaa-0000-0000-0000-000000000001';

  -- material_type IDs
  mt_neoprene   UUID := 'bbbbbbbb-0000-0000-0000-000000000001';
  mt_epdm       UUID := 'bbbbbbbb-0000-0000-0000-000000000002';
  mt_silicone   UUID := 'bbbbbbbb-0000-0000-0000-000000000003';
  mt_viton      UUID := 'bbbbbbbb-0000-0000-0000-000000000004';
  mt_nbr        UUID := 'bbbbbbbb-0000-0000-0000-000000000005';

  -- supplier IDs
  sup_premium   UUID := 'cccccccc-0000-0000-0000-000000000001';
  sup_midwest   UUID := 'cccccccc-0000-0000-0000-000000000002';
  sup_budget    UUID := 'cccccccc-0000-0000-0000-000000000003';
  sup_specialty UUID := 'cccccccc-0000-0000-0000-000000000004';

  -- roll IDs
  roll_neo_1    UUID := 'dddddddd-0000-0000-0000-000000000001';
  roll_neo_2    UUID := 'dddddddd-0000-0000-0000-000000000002';
  roll_epdm_1   UUID := 'dddddddd-0000-0000-0000-000000000003';
  roll_epdm_2   UUID := 'dddddddd-0000-0000-0000-000000000004';
  roll_sil_1    UUID := 'dddddddd-0000-0000-0000-000000000005';
  roll_viton_1  UUID := 'dddddddd-0000-0000-0000-000000000006';
  roll_nbr_1    UUID := 'dddddddd-0000-0000-0000-000000000007';
  roll_nbr_2    UUID := 'dddddddd-0000-0000-0000-000000000008';

  -- material_supplier IDs
  ms_neo_prem   UUID := 'eeeeeeee-0000-0000-0000-000000000001';
  ms_neo_mid    UUID := 'eeeeeeee-0000-0000-0000-000000000002';
  ms_epdm_prem  UUID := 'eeeeeeee-0000-0000-0000-000000000003';
  ms_epdm_bud   UUID := 'eeeeeeee-0000-0000-0000-000000000004';
  ms_sil_spec   UUID := 'eeeeeeee-0000-0000-0000-000000000005';
  ms_viton_spec UUID := 'eeeeeeee-0000-0000-0000-000000000006';
  ms_nbr_mid    UUID := 'eeeeeeee-0000-0000-0000-000000000007';

  -- purchase order IDs
  po_1          UUID := 'ffffffff-0000-0000-0000-000000000001';
  po_2          UUID := 'ffffffff-0000-0000-0000-000000000002';
  po_3          UUID := 'ffffffff-0000-0000-0000-000000000003';

BEGIN

-- ─────────────────────────────────────────────────────────────
-- 3. Material types
-- ─────────────────────────────────────────────────────────────

INSERT INTO material_types (id, user_id, name, description, default_cost, min_stock_alert) VALUES
  (mt_neoprene, v_uid, 'Neoprene',
   'General-purpose synthetic rubber. Excellent weather, oil, and flame resistance. Used for gaskets, hoses, and industrial seals.',
   12.50, 500.0),
  (mt_epdm, v_uid, 'EPDM',
   'Ethylene Propylene Diene Monomer. Superior UV and ozone resistance. Preferred for roofing membranes and outdoor seals.',
   8.75, 750.0),
  (mt_silicone, v_uid, 'Silicone',
   'High-temperature synthetic rubber (-60°C to +230°C). Food-safe grades available. Used in medical, food, and aerospace.',
   15.25, 300.0),
  (mt_viton, v_uid, 'Viton (FKM)',
   'Fluoroelastomer with outstanding chemical and heat resistance (up to 200°C). Used in aerospace and chemical processing.',
   28.50, 200.0),
  (mt_nbr, v_uid, 'Nitrile (NBR)',
   'Nitrile Butadiene Rubber. Excellent oil and fuel resistance. Standard material for automotive seals and O-rings.',
   9.25, 600.0)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 4. Suppliers
-- ─────────────────────────────────────────────────────────────

INSERT INTO suppliers (
  id, user_id, name, contact_person, email, phone,
  address, city, state, zip_code, country,
  website, payment_terms, rating, preferred, active, notes
) VALUES
  (sup_premium, v_uid,
   'Premium Rubber Supply Co.', 'John Anderson', 'john.anderson@premiumrubber.com', '+1-800-555-0101',
   '1234 Industrial Blvd', 'Cleveland', 'OH', '44101', 'USA',
   'https://www.premiumrubber.com', 'Net 30', 4.5, true, true,
   'Primary supplier. Consistent quality and reliable lead times.'),
  (sup_midwest, v_uid,
   'Midwest Materials Inc.', 'Sarah Chen', 'sarah.chen@midwestmaterials.com', '+1-800-555-0102',
   '5678 Manufacturing Ave', 'Chicago', 'IL', '60601', 'USA',
   'https://www.midwestmaterials.com', '2/10 Net 30', 4.0, true, true,
   'Good pricing on EPDM and NBR. 2% discount if paid within 10 days.'),
  (sup_budget, v_uid,
   'Budget Rubber Warehouse', 'Mike Rodriguez', 'mike@budgetrubber.com', '+1-800-555-0103',
   '9012 Warehouse Way', 'Detroit', 'MI', '48201', 'USA',
   'https://www.budgetrubber.com', 'Net 45', 3.5, false, true,
   'Use for high-volume commodity orders only. Quality inconsistent on specialty grades.'),
  (sup_specialty, v_uid,
   'Specialty Elastomers Ltd.', 'Dr. Emily Watson', 'emily.watson@specialtyelastomers.com', '+1-800-555-0104',
   '3456 Research Parkway', 'Akron', 'OH', '44301', 'USA',
   'https://www.specialtyelastomers.com', 'Net 30', 4.8, true, true,
   'Sole source for Viton and medical-grade silicone. Premium pricing but unmatched quality.')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 5. Rolls — widths/lengths in inches, costs per sq ft
-- ─────────────────────────────────────────────────────────────

INSERT INTO rolls (
  id, user_id, material_type_id, material_type,
  width, length, thickness, color, location,
  date_received, supplier, cost_per_sqft,
  remaining_length, status, notes
) VALUES
  -- Neoprene rolls
  (roll_neo_1, v_uid, mt_neoprene, 'Neoprene',
   60, 600, 0.125, 'Black', 'Rack A-1',
   CURRENT_DATE - INTERVAL '45 days', 'Premium Rubber Supply Co.', 12.50,
   480, 'active', 'Standard 1/8" sheet. High-volume stock.'),
  (roll_neo_2, v_uid, mt_neoprene, 'Neoprene',
   48, 300, 0.250, 'Black', 'Rack A-2',
   CURRENT_DATE - INTERVAL '20 days', 'Premium Rubber Supply Co.', 14.75,
   300, 'active', '1/4" thick. Received full — no cuts yet.'),

  -- EPDM rolls
  (roll_epdm_1, v_uid, mt_epdm, 'EPDM',
   72, 720, 0.063, 'Black', 'Rack B-1',
   CURRENT_DATE - INTERVAL '60 days', 'Midwest Materials Inc.', 8.75,
   540, 'active', '1/16" roofing grade. Roughly 25% consumed.'),
  (roll_epdm_2, v_uid, mt_epdm, 'EPDM',
   60, 480, 0.125, 'Black', 'Rack B-2',
   CURRENT_DATE - INTERVAL '10 days', 'Budget Rubber Warehouse', 7.90,
   480, 'active', 'Budget grade. Monitor quality on first use.'),

  -- Silicone rolls
  (roll_sil_1, v_uid, mt_silicone, 'Silicone',
   36, 240, 0.125, 'Red', 'Rack C-1',
   CURRENT_DATE - INTERVAL '30 days', 'Specialty Elastomers Ltd.', 15.25,
   180, 'active', 'Red silicone. High-temp application stock.'),

  -- Viton rolls
  (roll_viton_1, v_uid, mt_viton, 'Viton (FKM)',
   24, 120, 0.063, 'Black', 'Rack D-1',
   CURRENT_DATE - INTERVAL '15 days', 'Specialty Elastomers Ltd.', 28.50,
   96, 'active', 'FKM fluoroelastomer. Keep sealed until use.'),

  -- NBR rolls
  (roll_nbr_1, v_uid, mt_nbr, 'Nitrile (NBR)',
   60, 480, 0.125, 'Black', 'Rack E-1',
   CURRENT_DATE - INTERVAL '50 days', 'Midwest Materials Inc.', 9.25,
   120, 'active', 'Running low — reorder triggered.'),
  (roll_nbr_2, v_uid, mt_nbr, 'Nitrile (NBR)',
   60, 600, 0.063, 'Black', 'Rack E-2',
   CURRENT_DATE - INTERVAL '5 days', 'Midwest Materials Inc.', 9.00,
   600, 'reserved', 'Reserved for Job #J-2024-0088.')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 6. Cuts — historical cut records
--    Disable the cuts_update_roll trigger so remaining_length
--    on rolls stays at the pre-set seed values (the trigger
--    would otherwise double-subtract length).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE cuts DISABLE TRIGGER cuts_update_roll;

INSERT INTO cuts (
  user_id, roll_id,
  cut_width, cut_length, quantity,
  waste_sqft, waste_percentage, total_sqft_used,
  job_reference, cut_by, notes, created_at
) VALUES
  (v_uid, roll_neo_1,  12, 24, 10, 0.83, 4.2,  20.83, 'J-2024-0071', 'Mike Torres',   'Gaskets for hydraulic manifold assembly.',          NOW() - INTERVAL '40 days'),
  (v_uid, roll_neo_1,  18, 36,  4, 0.50, 3.1,  16.50, 'J-2024-0074', 'Mike Torres',   'Vibration damping pads.',                           NOW() - INTERVAL '35 days'),
  (v_uid, roll_neo_1,   6, 12, 20, 0.20, 2.0,  10.20, 'J-2024-0078', 'Lisa Park',     'Small gaskets — pressure test fixture.',            NOW() - INTERVAL '28 days'),
  (v_uid, roll_epdm_1, 24, 48,  6, 1.20, 5.0,  25.20, 'J-2024-0065', 'Carlos Reyes',  'Outdoor weatherstrip seals.',                       NOW() - INTERVAL '55 days'),
  (v_uid, roll_epdm_1, 36, 72,  2, 0.90, 3.5,  26.90, 'J-2024-0069', 'Carlos Reyes',  'Rooftop HVAC gaskets.',                             NOW() - INTERVAL '48 days'),
  (v_uid, roll_sil_1,  12, 12,  8, 0.22, 2.3,   9.89, 'J-2024-0080', 'Lisa Park',     'High-temp oven door seals.',                        NOW() - INTERVAL '22 days'),
  (v_uid, roll_sil_1,  18, 24,  3, 0.38, 3.4,  11.63, 'J-2024-0082', 'Mike Torres',   'Food-grade conveyor seals. QC checked.',            NOW() - INTERVAL '15 days'),
  (v_uid, roll_viton_1, 6,  6, 12, 0.18, 4.0,   4.68, 'J-2024-0083', 'Carlos Reyes',  'Chemical-resistant O-ring blanks.',                 NOW() - INTERVAL '12 days'),
  (v_uid, roll_nbr_1,  24, 36,  8, 1.60, 5.6,  30.27, 'J-2024-0075', 'Mike Torres',   'Automotive valve stem seals.',                      NOW() - INTERVAL '32 days'),
  (v_uid, roll_nbr_1,  12, 18, 15, 0.75, 3.8,  20.58, 'J-2024-0079', 'Lisa Park',     'Fuel system grommets.',                             NOW() - INTERVAL '25 days'),
  (v_uid, roll_neo_1,  30, 48,  2, 0.42, 2.8,  15.42, 'J-2024-0085', 'Carlos Reyes',  'Machine base anti-vibration mounts.',               NOW() - INTERVAL '7 days'),
  (v_uid, roll_epdm_2, 48, 60,  1, 0.55, 2.3,  24.55, 'J-2024-0086', 'Mike Torres',   'First cut from new roll — quality looks good.',     NOW() - INTERVAL '3 days');

ALTER TABLE cuts ENABLE TRIGGER cuts_update_roll;

-- ─────────────────────────────────────────────────────────────
-- 7. Material–Supplier relationships
-- ─────────────────────────────────────────────────────────────

INSERT INTO material_suppliers (
  id, user_id, material_type_id, supplier_id,
  supplier_material_code, cost_per_sqft,
  minimum_order_sqft, lead_time_days,
  preferred_supplier, active, effective_date
) VALUES
  (ms_neo_prem,  v_uid, mt_neoprene, sup_premium,  'PRS-NEO-001', 12.50, 500,  7, true,  true, CURRENT_DATE - INTERVAL '90 days'),
  (ms_neo_mid,   v_uid, mt_neoprene, sup_midwest,  'MMI-NEO-002', 11.75, 750, 10, false, true, CURRENT_DATE - INTERVAL '60 days'),
  (ms_epdm_prem, v_uid, mt_epdm,    sup_premium,  'PRS-EPD-001',  8.75, 750,  7, true,  true, CURRENT_DATE - INTERVAL '90 days'),
  (ms_epdm_bud,  v_uid, mt_epdm,    sup_budget,   'BRW-EPD-003',  7.40, 1000,14, false, true, CURRENT_DATE - INTERVAL '30 days'),
  (ms_sil_spec,  v_uid, mt_silicone, sup_specialty,'SEL-SIL-001', 15.25, 300,  5, true,  true, CURRENT_DATE - INTERVAL '90 days'),
  (ms_viton_spec,v_uid, mt_viton,   sup_specialty,'SEL-VIT-001', 28.50, 200,  5, true,  true, CURRENT_DATE - INTERVAL '90 days'),
  (ms_nbr_mid,   v_uid, mt_nbr,     sup_midwest,  'MMI-NBR-003',  9.25, 500, 10, true,  true, CURRENT_DATE - INTERVAL '90 days')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 8. Price history
-- ─────────────────────────────────────────────────────────────

INSERT INTO price_history (
  user_id, material_supplier_id,
  old_cost_per_sqft, new_cost_per_sqft,
  price_change_percentage, change_reason,
  effective_date, changed_by
) VALUES
  (v_uid, ms_neo_prem,  11.25, 12.50,  11.1, 'Raw material cost increase (Q1 2024)',    CURRENT_DATE - INTERVAL '90 days', 'admin@rema.dev'),
  (v_uid, ms_epdm_prem,  8.00,  8.75,   9.4, 'Supplier annual price adjustment',        CURRENT_DATE - INTERVAL '75 days', 'admin@rema.dev'),
  (v_uid, ms_sil_spec,  14.50, 15.25,   5.2, 'Silicone feedstock shortage surcharge',   CURRENT_DATE - INTERVAL '60 days', 'admin@rema.dev'),
  (v_uid, ms_neo_prem,  12.50, 12.50,   0.0, 'Price held — contract renewal Q2 2024',   CURRENT_DATE - INTERVAL '30 days', 'admin@rema.dev'),
  (v_uid, ms_nbr_mid,    8.75,  9.25,   5.7, 'Butadiene market price increase',         CURRENT_DATE - INTERVAL '14 days', 'admin@rema.dev');

-- ─────────────────────────────────────────────────────────────
-- 9. Reorder rules
-- ─────────────────────────────────────────────────────────────

INSERT INTO reorder_rules (
  user_id, material_type_id, supplier_id,
  reorder_point, reorder_quantity, max_stock_level,
  lead_time_days, safety_stock_days,
  auto_reorder, active
) VALUES
  (v_uid, mt_neoprene, sup_premium,   500, 1500, 3000, 7, 3, true,  true),
  (v_uid, mt_epdm,     sup_premium,   750, 2000, 4000, 7, 3, true,  true),
  (v_uid, mt_silicone, sup_specialty, 300,  900, 1800, 5, 2, false, true),
  (v_uid, mt_viton,    sup_specialty, 200,  600, 1200, 5, 2, false, true),
  (v_uid, mt_nbr,      sup_midwest,   600, 1500, 3000,10, 4, true,  true)
ON CONFLICT (material_type_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 10. Purchase orders
-- ─────────────────────────────────────────────────────────────

INSERT INTO purchase_orders (
  id, user_id, po_number, supplier_id, status,
  order_date, requested_delivery_date, actual_delivery_date,
  subtotal, tax_amount, shipping_cost, total_amount,
  payment_terms, created_by, approved_by, approved_at,
  auto_generated, notes
) VALUES
  (po_1, v_uid, 'PO-2024-0001', sup_premium, 'received',
   CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '23 days', CURRENT_DATE - INTERVAL '22 days',
   2500.00, 200.00, 75.00, 2775.00,
   'Net 30', 'admin@rema.dev', NULL, NULL,
   false, 'Routine neoprene restock. Received on time, quality verified.'),
  (po_2, v_uid, 'PO-2024-0002', sup_midwest, 'approved',
   CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '5 days', NULL,
   1850.00, 148.00, 50.00, 2048.00,
   '2/10 Net 30', 'admin@rema.dev', 'admin@rema.dev', NOW() - INTERVAL '4 days',
   false, 'NBR restock triggered by low stock alert. Pay early for 2% discount.'),
  (po_3, v_uid, 'PO-2024-0003', sup_specialty, 'draft',
   NULL, NULL, NULL,
   4275.00, 342.00, 0.00, 4617.00,
   'Net 30', 'admin@rema.dev', NULL, NULL,
   true, 'Auto-generated by reorder rule for Viton and Silicone. Awaiting approval.')
ON CONFLICT (po_number) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 11. Purchase order items
-- ─────────────────────────────────────────────────────────────

INSERT INTO purchase_order_items (
  user_id, purchase_order_id, material_type_id,
  line_number, description,
  width, length, thickness,
  quantity_sqft, unit_cost, line_total,
  quantity_received, received_date
) VALUES
  -- PO-2024-0001 (received)
  (v_uid, po_1, mt_neoprene, 1, 'Neoprene 1/8" Black 60" wide',
   60, 400, 0.125, 200.0, 12.50, 2500.00, 200.0, CURRENT_DATE - INTERVAL '22 days'),

  -- PO-2024-0002 (approved, in transit)
  (v_uid, po_2, mt_nbr,      1, 'Nitrile NBR 1/8" Black 60" wide',
   60, 400, 0.125, 200.0,  9.25, 1850.00, 0.0, NULL),

  -- PO-2024-0003 (draft)
  (v_uid, po_3, mt_viton,    1, 'Viton FKM 1/16" Black 24" wide',
   24, 100, 0.063,  75.0, 28.50, 2137.50, 0.0, NULL),
  (v_uid, po_3, mt_silicone, 2, 'Silicone Red 1/8" 36" wide',
   36, 200, 0.125, 137.5, 15.25, 2096.88, 0.0, NULL);

-- ─────────────────────────────────────────────────────────────
-- 12. Notification preferences
-- ─────────────────────────────────────────────────────────────

INSERT INTO notification_preferences (
  user_id, user_identifier, email,
  email_enabled, sms_enabled,
  low_stock_enabled, reorder_triggered_enabled,
  po_created_enabled, po_approved_enabled,
  delivery_expected_enabled, delivery_overdue_enabled, delivery_received_enabled,
  price_change_enabled, price_change_threshold,
  system_maintenance_enabled, critical_alerts_enabled,
  timezone, active
) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@rema.dev', 'admin@rema.dev',
   true, false, true, true, true, true, true, true, true, true, 5.0,
   true, true, 'America/New_York', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'manager@rema.dev', 'manager@rema.dev',
   true, false, true, true, true, true, true, true, true, true, 10.0,
   false, true, 'America/New_York', true)
ON CONFLICT (user_identifier) DO NOTHING;

END $$;
