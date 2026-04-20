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
  instance_id,
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'admin@rema.dev',
    crypt('Password123!', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Admin User"}'::jsonb,
    NOW(), NOW(), 'authenticated', 'authenticated',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0000-0000-0000-000000000002',
    'manager@rema.dev',
    crypt('Password123!', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Manager User"}'::jsonb,
    NOW(), NOW(), 'authenticated', 'authenticated',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0000-0000-0000-000000000003',
    'cutter@rema.dev',
    crypt('Password123!', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Cutter User"}'::jsonb,
    NOW(), NOW(), 'authenticated', 'authenticated',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0000-0000-0000-000000000004',
    'viewer@rema.dev',
    crypt('Password123!', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Viewer User"}'::jsonb,
    NOW(), NOW(), 'authenticated', 'authenticated',
    '', '', '', ''
  )
ON CONFLICT (id) DO NOTHING;

-- auth.identities — required for email/password login in modern GoTrue.
-- provider_id must match the user's id for the email provider.
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  NOW(),
  NOW(),
  NOW()
FROM auth.users u
WHERE u.id IN (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000004'
)
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. Profiles — handle_new_user trigger runs on auth.users
--    INSERT, so profiles are already created. Just set roles.
-- ─────────────────────────────────────────────────────────────

UPDATE profiles SET roles = ARRAY['admin', 'manager', 'member'] WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
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
  mt_hypalon    UUID := 'bbbbbbbb-0000-0000-0000-000000000006';
  mt_poly       UUID := 'bbbbbbbb-0000-0000-0000-000000000007';
  mt_butyl      UUID := 'bbbbbbbb-0000-0000-0000-000000000008';

  -- supplier IDs
  sup_premium   UUID := 'cccccccc-0000-0000-0000-000000000001';
  sup_midwest   UUID := 'cccccccc-0000-0000-0000-000000000002';
  sup_budget    UUID := 'cccccccc-0000-0000-0000-000000000003';
  sup_specialty UUID := 'cccccccc-0000-0000-0000-000000000004';
  sup_gulf      UUID := 'cccccccc-0000-0000-0000-000000000005';
  sup_pacific   UUID := 'cccccccc-0000-0000-0000-000000000006';

  -- roll IDs
  roll_neo_1    UUID := 'dddddddd-0000-0000-0000-000000000001';
  roll_neo_2    UUID := 'dddddddd-0000-0000-0000-000000000002';
  roll_epdm_1   UUID := 'dddddddd-0000-0000-0000-000000000003';
  roll_epdm_2   UUID := 'dddddddd-0000-0000-0000-000000000004';
  roll_sil_1    UUID := 'dddddddd-0000-0000-0000-000000000005';
  roll_viton_1  UUID := 'dddddddd-0000-0000-0000-000000000006';
  roll_nbr_1    UUID := 'dddddddd-0000-0000-0000-000000000007';
  roll_nbr_2    UUID := 'dddddddd-0000-0000-0000-000000000008';
  roll_neo_3    UUID := 'dddddddd-0000-0000-0000-000000000009';
  roll_neo_4    UUID := 'dddddddd-0000-0000-0000-000000000010';
  roll_epdm_3   UUID := 'dddddddd-0000-0000-0000-000000000011';
  roll_epdm_4   UUID := 'dddddddd-0000-0000-0000-000000000012';
  roll_sil_2    UUID := 'dddddddd-0000-0000-0000-000000000013';
  roll_sil_3    UUID := 'dddddddd-0000-0000-0000-000000000014';
  roll_viton_2  UUID := 'dddddddd-0000-0000-0000-000000000015';
  roll_nbr_3    UUID := 'dddddddd-0000-0000-0000-000000000016';
  roll_nbr_4    UUID := 'dddddddd-0000-0000-0000-000000000017';
  roll_hyp_1    UUID := 'dddddddd-0000-0000-0000-000000000018';
  roll_hyp_2    UUID := 'dddddddd-0000-0000-0000-000000000019';
  roll_poly_1   UUID := 'dddddddd-0000-0000-0000-000000000020';
  roll_poly_2   UUID := 'dddddddd-0000-0000-0000-000000000021';
  roll_butyl_1  UUID := 'dddddddd-0000-0000-0000-000000000022';

  -- material_supplier IDs
  ms_neo_prem   UUID := 'eeeeeeee-0000-0000-0000-000000000001';
  ms_neo_mid    UUID := 'eeeeeeee-0000-0000-0000-000000000002';
  ms_epdm_prem  UUID := 'eeeeeeee-0000-0000-0000-000000000003';
  ms_epdm_bud   UUID := 'eeeeeeee-0000-0000-0000-000000000004';
  ms_sil_spec   UUID := 'eeeeeeee-0000-0000-0000-000000000005';
  ms_viton_spec UUID := 'eeeeeeee-0000-0000-0000-000000000006';
  ms_nbr_mid    UUID := 'eeeeeeee-0000-0000-0000-000000000007';
  ms_hyp_gulf   UUID := 'eeeeeeee-0000-0000-0000-000000000008';
  ms_poly_pac   UUID := 'eeeeeeee-0000-0000-0000-000000000009';
  ms_butyl_gulf UUID := 'eeeeeeee-0000-0000-0000-000000000010';
  ms_neo_pac    UUID := 'eeeeeeee-0000-0000-0000-000000000011';
  ms_sil_gulf   UUID := 'eeeeeeee-0000-0000-0000-000000000012';

  -- purchase order IDs
  po_1          UUID := 'ffffffff-0000-0000-0000-000000000001';
  po_2          UUID := 'ffffffff-0000-0000-0000-000000000002';
  po_3          UUID := 'ffffffff-0000-0000-0000-000000000003';
  po_4          UUID := 'ffffffff-0000-0000-0000-000000000004';
  po_5          UUID := 'ffffffff-0000-0000-0000-000000000005';
  po_6          UUID := 'ffffffff-0000-0000-0000-000000000006';
  po_7          UUID := 'ffffffff-0000-0000-0000-000000000007';
  po_8          UUID := 'ffffffff-0000-0000-0000-000000000008';
  po_9          UUID := 'ffffffff-0000-0000-0000-000000000009';
  po_10         UUID := 'ffffffff-0000-0000-0000-000000000010';
  po_11         UUID := 'ffffffff-0000-0000-0000-000000000011';

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
   9.25, 600.0),
  (mt_hypalon, v_uid, 'Hypalon (CSM)',
   'Chlorosulfonated polyethylene. Superior chemical, acid, and UV resistance. Used for chemical tank liners and inflatable boats.',
   18.90, 250.0),
  (mt_poly, v_uid, 'Polyurethane',
   'Abrasion-resistant elastomer with excellent tear strength. Preferred for conveyor scrapers, rollers, and high-wear seals.',
   21.40, 350.0),
  (mt_butyl, v_uid, 'Butyl',
   'Isobutylene isoprene rubber. Exceptional gas impermeability and weathering resistance. Used for inner tubes and vapor seals.',
   11.80, 400.0)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 4. Suppliers
-- ─────────────────────────────────────────────────────────────

INSERT INTO suppliers (
  id, user_id, name, contact_person, email, phone,
  address, city, state, zip_code, country,
  website, payment_terms, rating, preferred, active, notes,
  tax_rate, tax_exempt, default_shipping_cost, shipping_calculation_type
) VALUES
  (sup_premium, v_uid,
   'Premium Rubber Supply Co.', 'John Anderson', 'john.anderson@premiumrubber.com', '+1-800-555-0101',
   '1234 Industrial Blvd', 'Cleveland', 'OH', '44101', 'USA',
   'https://www.premiumrubber.com', 'Net 30', 4.5, true, true,
   'Primary supplier. Consistent quality and reliable lead times.',
   0.0800, false, 75.00, 'flat'),
  (sup_midwest, v_uid,
   'Midwest Materials Inc.', 'Sarah Chen', 'sarah.chen@midwestmaterials.com', '+1-800-555-0102',
   '5678 Manufacturing Ave', 'Chicago', 'IL', '60601', 'USA',
   'https://www.midwestmaterials.com', '2/10 Net 30', 4.0, true, true,
   'Good pricing on EPDM and NBR. 2% discount if paid within 10 days.',
   0.1025, false, 50.00, 'flat'),
  (sup_budget, v_uid,
   'Budget Rubber Warehouse', 'Mike Rodriguez', 'mike@budgetrubber.com', '+1-800-555-0103',
   '9012 Warehouse Way', 'Detroit', 'MI', '48201', 'USA',
   'https://www.budgetrubber.com', 'Net 45', 3.5, false, true,
   'Use for high-volume commodity orders only. Quality inconsistent on specialty grades.',
   0.0600, false, 35.00, 'flat'),
  (sup_specialty, v_uid,
   'Specialty Elastomers Ltd.', 'Dr. Emily Watson', 'emily.watson@specialtyelastomers.com', '+1-800-555-0104',
   '3456 Research Parkway', 'Akron', 'OH', '44301', 'USA',
   'https://www.specialtyelastomers.com', 'Net 30', 4.8, true, true,
   'Sole source for Viton and medical-grade silicone. Premium pricing but unmatched quality.',
   0.0800, false, 100.00, 'weight'),
  (sup_gulf, v_uid,
   'Gulf Coast Rubber', 'Daniel Pham', 'daniel.pham@gulfcoastrubber.com', '+1-800-555-0105',
   '7890 Bayport Drive', 'Houston', 'TX', '77029', 'USA',
   'https://www.gulfcoastrubber.com', 'Net 30', 4.2, false, true,
   'Strong on Hypalon and chemical-resistant stock. Texas-based — faster lead times for Gulf region.',
   0.0825, false, 60.00, 'percentage'),
  (sup_pacific, v_uid,
   'Pacific Seal Co.', 'Yuki Tanaka', 'yuki.tanaka@pacificseal.com', '+1-800-555-0106',
   '2020 Waterfront Ave', 'Seattle', 'WA', '98101', 'USA',
   'https://www.pacificseal.com', 'Net 30', 4.6, true, true,
   'Polyurethane specialists. Import-grade stock with full traceability certs.',
   0.0650, false, 120.00, 'weight')
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
   600, 'reserved', 'Reserved for Job #J-2024-0088.'),

  -- Additional Neoprene rolls
  (roll_neo_3, v_uid, mt_neoprene, 'Neoprene',
   72, 720, 0.094, 'Black', 'Rack A-3',
   CURRENT_DATE - INTERVAL '75 days', 'Midwest Materials Inc.', 11.75,
   180, 'active', 'Running low — below min_stock_alert. Reorder pending.'),
  (roll_neo_4, v_uid, mt_neoprene, 'Neoprene',
   36, 480, 0.375, 'Black', 'Rack A-4',
   CURRENT_DATE - INTERVAL '110 days', 'Premium Rubber Supply Co.', 16.80,
   0, 'depleted', '3/8" thick. Depleted Q1 — awaiting archive.'),

  -- Additional EPDM rolls
  (roll_epdm_3, v_uid, mt_epdm, 'EPDM',
   60, 480, 0.188, 'Black', 'Rack B-3',
   CURRENT_DATE - INTERVAL '35 days', 'Premium Rubber Supply Co.', 9.40,
   360, 'active', '3/16" compression-molded. Commercial grade.'),
  (roll_epdm_4, v_uid, mt_epdm, 'EPDM',
   48, 360, 0.032, 'Black', 'Rack B-4',
   CURRENT_DATE - INTERVAL '7 days', 'Midwest Materials Inc.', 7.20,
   360, 'active', '1/32" thin-gauge sheet. Arrived this week.'),

  -- Additional Silicone rolls
  (roll_sil_2, v_uid, mt_silicone, 'Silicone',
   48, 300, 0.094, 'White', 'Rack C-2',
   CURRENT_DATE - INTERVAL '18 days', 'Specialty Elastomers Ltd.', 16.50,
   210, 'active', 'FDA-grade white silicone. Food processing line.'),
  (roll_sil_3, v_uid, mt_silicone, 'Silicone',
   36, 180, 0.250, 'Translucent', 'Rack C-3',
   CURRENT_DATE - INTERVAL '95 days', 'Specialty Elastomers Ltd.', 17.90,
   0, 'depleted', 'Translucent high-temp. Depleted — replenish on next order.'),

  -- Additional Viton rolls
  (roll_viton_2, v_uid, mt_viton, 'Viton (FKM)',
   36, 180, 0.125, 'Brown', 'Rack D-2',
   CURRENT_DATE - INTERVAL '25 days', 'Specialty Elastomers Ltd.', 31.20,
   140, 'active', 'Brown FKM — aerospace certification lot.'),

  -- Additional NBR rolls
  (roll_nbr_3, v_uid, mt_nbr, 'Nitrile (NBR)',
   72, 720, 0.032, 'Black', 'Rack E-3',
   CURRENT_DATE - INTERVAL '85 days', 'Premium Rubber Supply Co.', 8.90,
   450, 'active', 'Thin gauge for diaphragm fabrication.'),
  (roll_nbr_4, v_uid, mt_nbr, 'Nitrile (NBR)',
   48, 360, 0.250, 'Black', 'Rack E-4',
   CURRENT_DATE - INTERVAL '65 days', 'Budget Rubber Warehouse', 8.10,
   0, 'depleted', 'Budget lot — depleted. Quality was acceptable but uneven.'),

  -- Hypalon rolls
  (roll_hyp_1, v_uid, mt_hypalon, 'Hypalon (CSM)',
   48, 240, 0.063, 'Gray', 'Rack F-1',
   CURRENT_DATE - INTERVAL '40 days', 'Gulf Coast Rubber', 18.90,
   180, 'active', 'Gray Hypalon — acid tank lining stock.'),
  (roll_hyp_2, v_uid, mt_hypalon, 'Hypalon (CSM)',
   36, 180, 0.125, 'Black', 'Rack F-2',
   CURRENT_DATE - INTERVAL '12 days', 'Gulf Coast Rubber', 19.40,
   180, 'reserved', 'Reserved for Job #J-2024-0108 (chemical plant retrofit).'),

  -- Polyurethane rolls
  (roll_poly_1, v_uid, mt_poly, 'Polyurethane',
   60, 300, 0.188, 'Amber', 'Rack G-1',
   CURRENT_DATE - INTERVAL '55 days', 'Pacific Seal Co.', 21.40,
   120, 'active', 'Amber 80A durometer. Conveyor scraper stock.'),
  (roll_poly_2, v_uid, mt_poly, 'Polyurethane',
   48, 240, 0.375, 'Amber', 'Rack G-2',
   CURRENT_DATE - INTERVAL '22 days', 'Pacific Seal Co.', 23.80,
   240, 'active', '90A durometer — abrasion-resistant roller cover.'),

  -- Butyl rolls
  (roll_butyl_1, v_uid, mt_butyl, 'Butyl',
   48, 300, 0.094, 'Black', 'Rack H-1',
   CURRENT_DATE - INTERVAL '48 days', 'Gulf Coast Rubber', 11.80,
   260, 'active', 'Standard butyl sheet. Gas-impermeable vapor seal use.')
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
  (v_uid, roll_epdm_2, 48, 60,  1, 0.55, 2.3,  24.55, 'J-2024-0086', 'Mike Torres',   'First cut from new roll — quality looks good.',     NOW() - INTERVAL '3 days'),

  -- Additional historical cuts (spread across ~180 days for trends)
  (v_uid, roll_neo_3,   24, 36,  5, 0.90, 4.1,  21.90, 'J-2024-0060', 'Carlos Reyes',  'Pump housing gaskets.',                             NOW() - INTERVAL '170 days'),
  (v_uid, roll_epdm_1,  12, 24,  8, 0.48, 3.0,  16.48, 'J-2024-0061', 'Lisa Park',     'Terminal box seals.',                               NOW() - INTERVAL '162 days'),
  (v_uid, roll_nbr_3,   18, 30,  4, 0.60, 4.8,  15.60, 'J-2024-0062', 'Mike Torres',   'Fuel filter rings.',                                NOW() - INTERVAL '155 days'),
  (v_uid, roll_neo_1,   36, 48, 2, 0.75, 3.9,  24.75, 'J-2024-0063', 'Ana Silva',     'Equipment base pads.',                              NOW() - INTERVAL '148 days'),
  (v_uid, roll_epdm_3,  24, 36,  6, 1.08, 5.0,  21.96, 'J-2024-0064', 'Carlos Reyes',  'Weatherproof panel gaskets.',                       NOW() - INTERVAL '140 days'),
  (v_uid, roll_sil_2,   12, 18,  10, 0.75, 3.3,  23.25, 'J-2024-0066', 'Lisa Park',    'Food-line conveyor seals.',                         NOW() - INTERVAL '133 days'),
  (v_uid, roll_neo_1,   18, 24,  6, 0.72, 4.0,  17.28, 'J-2024-0067', 'Mike Torres',   'Air compressor mounts.',                            NOW() - INTERVAL '125 days'),
  (v_uid, roll_nbr_3,   24, 48, 3, 0.90, 3.8,  23.70, 'J-2024-0068', 'Jake Morrison',  'Hydraulic reservoir gaskets.',                      NOW() - INTERVAL '118 days'),
  (v_uid, roll_hyp_1,   24, 36,  2, 0.42, 3.5,  12.42, 'J-2024-0070', 'Ana Silva',     'Chemical tank liner sample.',                       NOW() - INTERVAL '108 days'),
  (v_uid, roll_viton_2, 12, 24,  4, 0.32, 3.9,   8.32, 'J-2024-0072', 'Carlos Reyes',  'Solvent line flange seals.',                        NOW() - INTERVAL '100 days'),
  (v_uid, roll_poly_1,  18, 36,  3, 0.54, 3.8,  14.04, 'J-2024-0073', 'Jake Morrison', 'Conveyor scraper blades.',                          NOW() - INTERVAL '92 days'),
  (v_uid, roll_butyl_1, 24, 36,  4, 0.72, 3.5,  24.72, 'J-2024-0076', 'Mike Torres',   'Vapor barrier pads.',                               NOW() - INTERVAL '85 days'),
  (v_uid, roll_epdm_1,  36, 60,  2, 1.05, 4.2,  30.45, 'J-2024-0077', 'Lisa Park',     'Rooftop curb seals.',                               NOW() - INTERVAL '78 days'),
  (v_uid, roll_sil_1,   6,  12, 20, 0.25, 2.1,  10.25, 'J-2024-0081', 'Ana Silva',     'Micro-gaskets for sensor housings.',                NOW() - INTERVAL '70 days'),
  (v_uid, roll_nbr_1,   36, 48,  3, 1.20, 4.6,  37.20, 'J-2024-0084', 'Mike Torres',   'Transmission pan gaskets.',                         NOW() - INTERVAL '62 days'),
  (v_uid, roll_poly_2,  24, 48,  2, 0.48, 2.8,  16.48, 'J-2024-0087', 'Jake Morrison', 'Drum roller covers.',                               NOW() - INTERVAL '55 days'),
  (v_uid, roll_hyp_1,   18, 30,  3, 0.45, 3.8,  11.70, 'J-2024-0089', 'Carlos Reyes',  'Secondary containment sheet.',                      NOW() - INTERVAL '50 days'),
  (v_uid, roll_neo_2,   24, 36,  4, 0.72, 3.7,  24.72, 'J-2024-0090', 'Lisa Park',     '1/4" damper pads.',                                 NOW() - INTERVAL '44 days'),
  (v_uid, roll_viton_1, 8,  12,  6, 0.24, 4.1,   4.74, 'J-2024-0091', 'Ana Silva',     'O-ring blanks — chem processing.',                  NOW() - INTERVAL '40 days'),
  (v_uid, roll_epdm_3,  48, 60,  1, 0.65, 3.1,  20.65, 'J-2024-0092', 'Mike Torres',   'Large flat gasket — reactor lid.',                  NOW() - INTERVAL '37 days'),
  (v_uid, roll_sil_2,   18, 24,  5, 0.60, 3.2,  15.60, 'J-2024-0093', 'Jake Morrison', 'Oven glass edge seals.',                            NOW() - INTERVAL '33 days'),
  (v_uid, roll_butyl_1, 12, 18, 10, 0.60, 3.6,  15.60, 'J-2024-0094', 'Carlos Reyes',  'Duct vapor seals.',                                 NOW() - INTERVAL '30 days'),
  (v_uid, roll_nbr_3,   24, 36,  5, 1.35, 5.3,  25.35, 'J-2024-0095', 'Lisa Park',     'Agricultural hose flanges.',                        NOW() - INTERVAL '27 days'),
  (v_uid, roll_poly_1,  24, 36,  2, 0.36, 2.5,  12.36, 'J-2024-0096', 'Ana Silva',     'Wear pads for lift carriage.',                      NOW() - INTERVAL '24 days'),
  (v_uid, roll_neo_3,   12, 18,  12, 0.54, 3.0,  18.54, 'J-2024-0097', 'Mike Torres',   'Compressor vibration mounts.',                      NOW() - INTERVAL '21 days'),
  (v_uid, roll_epdm_4,  36, 48,  2, 0.84, 3.9,  24.84, 'J-2024-0098', 'Jake Morrison', 'Thin HVAC flange seals.',                           NOW() - INTERVAL '19 days'),
  (v_uid, roll_hyp_1,   36, 48,  1, 0.36, 2.9,  12.36, 'J-2024-0099', 'Carlos Reyes',  'Chemical splash shield.',                           NOW() - INTERVAL '17 days'),
  (v_uid, roll_sil_1,   24, 24,  4, 0.48, 3.0,  16.48, 'J-2024-0100', 'Lisa Park',     'Heat-resistant door seals.',                        NOW() - INTERVAL '14 days'),
  (v_uid, roll_viton_2, 12, 18,  6, 0.36, 4.0,   9.36, 'J-2024-0101', 'Ana Silva',     'Chemical reactor O-rings.',                         NOW() - INTERVAL '11 days'),
  (v_uid, roll_nbr_1,   24, 30,  4, 0.80, 4.4,  20.80, 'J-2024-0102', 'Mike Torres',   'Fuel injection gaskets.',                           NOW() - INTERVAL '10 days'),
  (v_uid, roll_poly_2,  36, 48,  2, 0.72, 3.0,  24.72, 'J-2024-0103', 'Jake Morrison', 'Lift-gate scraper blades.',                         NOW() - INTERVAL '9 days'),
  (v_uid, roll_butyl_1, 18, 24,  6, 0.54, 3.8,  18.54, 'J-2024-0104', 'Carlos Reyes',  'Vapor barrier membrane cuts.',                      NOW() - INTERVAL '8 days'),
  (v_uid, roll_epdm_1,  60, 72,  1, 1.20, 4.0,  31.20, 'J-2024-0105', 'Lisa Park',     'Full-sheet roof patch.',                            NOW() - INTERVAL '6 days'),
  (v_uid, roll_neo_1,   12, 16,  18, 0.48, 2.2,  22.48, 'J-2024-0106', 'Ana Silva',     'Small vibration isolators.',                        NOW() - INTERVAL '5 days'),
  (v_uid, roll_sil_2,   8,  12,  12, 0.30, 2.4,  10.30, 'J-2024-0107', 'Mike Torres',   'Sensor probe seals.',                               NOW() - INTERVAL '4 days'),
  (v_uid, roll_hyp_1,   24, 48,  1, 0.24, 1.8,  11.24, 'J-2024-0109', 'Carlos Reyes',  'Tank patch — field repair.',                        NOW() - INTERVAL '3 days'),
  (v_uid, roll_poly_1,  18, 24,  4, 0.48, 3.3,  14.48, 'J-2024-0110', 'Jake Morrison', 'Idler roller covers.',                              NOW() - INTERVAL '2 days'),
  (v_uid, roll_epdm_3,  18, 24,  6, 0.72, 3.4,  20.72, 'J-2024-0111', 'Lisa Park',     'Door frame weatherstrip.',                          NOW() - INTERVAL '2 days'),
  (v_uid, roll_neo_2,   30, 36,  2, 0.60, 3.2,  18.60, 'J-2024-0112', 'Ana Silva',     'Machine base mounts.',                              NOW() - INTERVAL '1 days'),
  (v_uid, roll_butyl_1, 24, 30,  3, 0.60, 3.8,  15.60, 'J-2024-0113', 'Mike Torres',   'Duct joint seals.',                                 NOW() - INTERVAL '1 days'),
  (v_uid, roll_nbr_3,   12, 18, 10, 0.54, 3.2,  15.54, 'J-2024-0114', 'Jake Morrison', 'Valve stem seals — latest batch.',                  NOW() - INTERVAL '12 hours'),
  (v_uid, roll_viton_2, 6,  12,  8, 0.16, 3.2,   4.16, 'J-2024-0115', 'Carlos Reyes',  'Chemical dosing O-rings.',                          NOW() - INTERVAL '4 hours');

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
  (ms_nbr_mid,   v_uid, mt_nbr,     sup_midwest,  'MMI-NBR-003',  9.25, 500, 10, true,  true, CURRENT_DATE - INTERVAL '90 days'),
  (ms_hyp_gulf,   v_uid, mt_hypalon, sup_gulf,     'GCR-HYP-001', 18.90, 250,  9, true,  true, CURRENT_DATE - INTERVAL '60 days'),
  (ms_poly_pac,   v_uid, mt_poly,    sup_pacific,  'PSC-PU-001',  21.40, 200, 12, true,  true, CURRENT_DATE - INTERVAL '60 days'),
  (ms_butyl_gulf, v_uid, mt_butyl,   sup_gulf,     'GCR-BUT-001', 11.80, 400,  9, true,  true, CURRENT_DATE - INTERVAL '60 days'),
  (ms_neo_pac,    v_uid, mt_neoprene, sup_pacific, 'PSC-NEO-002', 12.80, 500, 12, false, true, CURRENT_DATE - INTERVAL '45 days'),
  (ms_sil_gulf,   v_uid, mt_silicone, sup_gulf,    'GCR-SIL-001', 16.20, 300,  9, false, true, CURRENT_DATE - INTERVAL '45 days')
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
  (v_uid, ms_nbr_mid,    8.75,  9.25,   5.7, 'Butadiene market price increase',         CURRENT_DATE - INTERVAL '14 days', 'admin@rema.dev'),
  (v_uid, ms_viton_spec, 27.00, 28.50,  5.6, 'Fluoroelastomer feedstock shortage',      CURRENT_DATE - INTERVAL '100 days', 'admin@rema.dev'),
  (v_uid, ms_epdm_bud,    7.80,  7.40, -5.1, 'Volume discount renegotiated',            CURRENT_DATE - INTERVAL '45 days',  'admin@rema.dev'),
  (v_uid, ms_hyp_gulf,   17.50, 18.90,  8.0, 'Hypalon CSM tariff adjustment',           CURRENT_DATE - INTERVAL '40 days',  'admin@rema.dev'),
  (v_uid, ms_poly_pac,   20.50, 21.40,  4.4, 'TDI feedstock price increase',            CURRENT_DATE - INTERVAL '35 days',  'admin@rema.dev'),
  (v_uid, ms_butyl_gulf, 11.00, 11.80,  7.3, 'Isobutylene supply contract renewal',     CURRENT_DATE - INTERVAL '28 days',  'admin@rema.dev'),
  (v_uid, ms_neo_pac,    12.80, 12.80,  0.0, 'Import rate locked via 12-month contract',CURRENT_DATE - INTERVAL '20 days',  'admin@rema.dev'),
  (v_uid, ms_sil_gulf,   15.90, 16.20,  1.9, 'Minor freight surcharge passthrough',     CURRENT_DATE - INTERVAL '7 days',   'admin@rema.dev');

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
  (v_uid, mt_nbr,      sup_midwest,   600, 1500, 3000,10, 4, true,  true),
  (v_uid, mt_hypalon,  sup_gulf,      250,  750, 1500, 9, 3, false, true),
  (v_uid, mt_poly,     sup_pacific,   350, 1000, 2000,12, 4, false, true),
  (v_uid, mt_butyl,    sup_gulf,      400, 1200, 2400, 9, 3, true,  true)
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
   true, 'Auto-generated by reorder rule for Viton and Silicone. Awaiting approval.'),
  (po_4, v_uid, 'PO-2024-0004', sup_gulf, 'received',
   CURRENT_DATE - INTERVAL '75 days', CURRENT_DATE - INTERVAL '66 days', CURRENT_DATE - INTERVAL '64 days',
   3780.00, 311.85, 60.00, 4151.85,
   'Net 30', 'admin@rema.dev', 'admin@rema.dev', NOW() - INTERVAL '74 days',
   false, 'Initial Hypalon order — chemical plant contract. Received ahead of schedule.'),
  (po_5, v_uid, 'PO-2024-0005', sup_pacific, 'received',
   CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE - INTERVAL '48 days', CURRENT_DATE - INTERVAL '47 days',
   5992.00, 389.48, 120.00, 6501.48,
   'Net 30', 'admin@rema.dev', 'admin@rema.dev', NOW() - INTERVAL '59 days',
   false, 'Polyurethane bulk order. QC inspection passed.'),
  (po_6, v_uid, 'PO-2024-0006', sup_gulf, 'ordered',
   CURRENT_DATE - INTERVAL '12 days', CURRENT_DATE + INTERVAL '2 days', NULL,
   2832.00, 233.64, 60.00, 3125.64,
   'Net 30', 'admin@rema.dev', 'admin@rema.dev', NOW() - INTERVAL '11 days',
   true, 'Auto-reorder triggered — Butyl stock below threshold. Awaiting delivery.'),
  (po_7, v_uid, 'PO-2024-0007', sup_budget, 'pending',
   CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '12 days', NULL,
   1480.00, 88.80, 35.00, 1603.80,
   'Net 45', 'admin@rema.dev', NULL, NULL,
   false, 'EPDM commodity restock. Awaiting manager sign-off.'),
  (po_8, v_uid, 'PO-2024-0008', sup_midwest, 'approved',
   CURRENT_DATE - INTERVAL '1 days', CURRENT_DATE + INTERVAL '9 days', NULL,
   2220.00, 227.55, 50.00, 2497.55,
   '2/10 Net 30', 'admin@rema.dev', 'admin@rema.dev', NOW() - INTERVAL '6 hours',
   false, 'NBR thin-gauge restock. Pay early to capture 2% discount.'),
  (po_9, v_uid, 'PO-2024-0009', sup_specialty, 'draft',
   NULL, NULL, NULL,
   3648.00, 291.84, 0.00, 3939.84,
   'Net 30', 'admin@rema.dev', NULL, NULL,
   false, 'Aerospace-grade Viton restock draft. Pending engineering spec review.'),
  (po_10, v_uid, 'PO-2024-0010', sup_premium, 'cancelled',
   CURRENT_DATE - INTERVAL '40 days', CURRENT_DATE - INTERVAL '30 days', NULL,
   950.00, 76.00, 75.00, 1101.00,
   'Net 30', 'admin@rema.dev', NULL, NULL,
   false, 'Cancelled — scope absorbed into PO-2024-0005 to consolidate shipping.'),
  (po_11, v_uid, 'PO-2024-0011', sup_pacific, 'ordered',
   CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE + INTERVAL '6 days', NULL,
   4280.00, 278.20, 120.00, 4678.20,
   'Net 30', 'admin@rema.dev', 'admin@rema.dev', NOW() - INTERVAL '5 days',
   false, 'Polyurethane Q2 replenishment. Shipment tracked.')
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
   36, 200, 0.125, 137.5, 15.25, 2096.88, 0.0, NULL),

  -- PO-2024-0004 (received, Hypalon)
  (v_uid, po_4, mt_hypalon, 1, 'Hypalon CSM 1/16" Gray 48" wide',
   48, 240, 0.063, 120.0, 18.90, 2268.00, 120.0, CURRENT_DATE - INTERVAL '64 days'),
  (v_uid, po_4, mt_hypalon, 2, 'Hypalon CSM 1/8" Black 36" wide',
   36, 180, 0.125,  80.0, 18.90, 1512.00,  80.0, CURRENT_DATE - INTERVAL '64 days'),

  -- PO-2024-0005 (received, Polyurethane)
  (v_uid, po_5, mt_poly, 1, 'Polyurethane 3/16" Amber 60" wide',
   60, 300, 0.188, 150.0, 21.40, 3210.00, 150.0, CURRENT_DATE - INTERVAL '47 days'),
  (v_uid, po_5, mt_poly, 2, 'Polyurethane 3/8" Amber 48" wide',
   48, 240, 0.375, 117.0, 23.78, 2782.26, 117.0, CURRENT_DATE - INTERVAL '47 days'),

  -- PO-2024-0006 (ordered, Butyl auto-reorder)
  (v_uid, po_6, mt_butyl, 1, 'Butyl 3/32" Black 48" wide',
   48, 300, 0.094, 240.0, 11.80, 2832.00, 0.0, NULL),

  -- PO-2024-0007 (pending, EPDM commodity)
  (v_uid, po_7, mt_epdm, 1, 'EPDM 1/8" Black 60" wide (budget)',
   60, 480, 0.125, 200.0,  7.40, 1480.00, 0.0, NULL),

  -- PO-2024-0008 (approved, NBR thin-gauge)
  (v_uid, po_8, mt_nbr, 1, 'Nitrile NBR 1/32" Black 72" wide',
   72, 720, 0.032, 240.0,  9.25, 2220.00, 0.0, NULL),

  -- PO-2024-0009 (draft, aerospace Viton)
  (v_uid, po_9, mt_viton, 1, 'Viton FKM 1/8" Brown 36" wide (aerospace)',
   36, 180, 0.125, 120.0, 30.40, 3648.00, 0.0, NULL),

  -- PO-2024-0010 (cancelled, Neoprene)
  (v_uid, po_10, mt_neoprene, 1, 'Neoprene 1/8" Black 60" wide (cancelled scope)',
   60, 240, 0.125, 100.0,  9.50,  950.00, 0.0, NULL),

  -- PO-2024-0011 (ordered, Polyurethane Q2)
  (v_uid, po_11, mt_poly, 1, 'Polyurethane 3/16" Amber 60" wide',
   60, 400, 0.188, 200.0, 21.40, 4280.00, 0.0, NULL);

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
   false, true, 'America/New_York', true),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'cutter@rema.dev', 'cutter@rema.dev',
   true, false, false, false, false, false, true, true, true, false, 15.0,
   false, true, 'America/Chicago', true),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'viewer@rema.dev', 'viewer@rema.dev',
   false, false, false, false, false, false, false, false, false, false, 20.0,
   false, true, 'America/New_York', true)
ON CONFLICT (user_identifier) DO NOTHING;

-- Demo quiet hours on admin (10 PM – 7 AM) so the quiet-hour filter has something to show.
UPDATE notification_preferences
   SET quiet_hours_start = '22:00',
       quiet_hours_end   = '07:00'
 WHERE user_identifier = 'admin@rema.dev';

-- ─────────────────────────────────────────────────────────────
-- 13. In-app notifications (admin feed)
--     CHECK constraint allows: low_stock | roll_depleted |
--     cut_completed | system_alert. Non-matching events are
--     stored as system_alert (see CLAUDE.md notifications gotcha).
-- ─────────────────────────────────────────────────────────────

INSERT INTO notifications (
  user_id, type, title, description,
  material_type, current_value, threshold_value,
  is_read, created_at
) VALUES
  -- Low-stock alerts
  (v_uid, 'low_stock',     'Neoprene running low',
   'Neoprene stock has dropped below the reorder threshold. Review open POs before placing a new one.',
   'Neoprene',     180.00, 500.00, false, NOW() - INTERVAL '13 days'),
  (v_uid, 'low_stock',     'Nitrile (NBR) below safety stock',
   'Nitrile thin-gauge inventory is critically low. PO-2024-0008 in flight.',
   'Nitrile (NBR)', 120.00, 600.00, true,  NOW() - INTERVAL '10 days'),
  (v_uid, 'low_stock',     'Hypalon stock alert',
   'Hypalon remaining length is near threshold. Consider bringing forward next reorder.',
   'Hypalon (CSM)', 180.00, 250.00, false, NOW() - INTERVAL '6 days'),
  (v_uid, 'low_stock',     'Polyurethane below threshold',
   'Polyurethane remaining below reorder point on Rack G-1.',
   'Polyurethane',  120.00, 350.00, false, NOW() - INTERVAL '2 days'),

  -- Roll-depleted alerts
  (v_uid, 'roll_depleted', 'Roll dddddddd-…010 depleted',
   'Neoprene roll on Rack A-4 has reached zero remaining length. Mark for archive.',
   'Neoprene',        0.00, NULL,   true,  NOW() - INTERVAL '48 days'),
  (v_uid, 'roll_depleted', 'Roll dddddddd-…014 depleted',
   'Translucent silicone roll exhausted — replenish order required.',
   'Silicone',        0.00, NULL,   false, NOW() - INTERVAL '30 days'),

  -- Cut-completed events (job wrap-ups)
  (v_uid, 'cut_completed', 'Job J-2024-0105 completed',
   'Full-sheet roof patch cut completed by Lisa Park. 31.2 sqft material used.',
   'EPDM',           31.20, NULL,   true,  NOW() - INTERVAL '6 days'),
  (v_uid, 'cut_completed', 'Job J-2024-0109 completed',
   'Field-repair tank patch cut completed by Carlos Reyes on Hypalon stock.',
   'Hypalon (CSM)',  11.24, NULL,   false, NOW() - INTERVAL '3 days'),
  (v_uid, 'cut_completed', 'Job J-2024-0115 completed',
   'Chemical dosing O-ring blanks cut from Viton.',
   'Viton (FKM)',     4.16, NULL,   false, NOW() - INTERVAL '4 hours'),

  -- System alerts (PO / reorder / price changes routed as system_alert per CHECK)
  (v_uid, 'system_alert',  'Auto-reorder triggered: Butyl',
   'Reorder rule for Butyl fired. Draft PO-2024-0006 created against Gulf Coast Rubber.',
   'Butyl',         NULL,   NULL,   true,  NOW() - INTERVAL '12 days'),
  (v_uid, 'system_alert',  'Price change: Nitrile (NBR) +5.7%',
   'Midwest Materials raised NBR pricing from $8.75 to $9.25 per sqft.',
   'Nitrile (NBR)',  9.25,  8.75,   true,  NOW() - INTERVAL '14 days'),
  (v_uid, 'system_alert',  'PO-2024-0008 awaiting approval',
   'Purchase order PO-2024-0008 has been approved and is ready to be placed with Midwest Materials.',
   'Nitrile (NBR)', NULL,   NULL,   false, NOW() - INTERVAL '6 hours');

-- ─────────────────────────────────────────────────────────────
-- 14. Notification queue (email/SMS dispatch)
-- ─────────────────────────────────────────────────────────────

INSERT INTO notification_queue (
  user_id, user_identifier, notification_type,
  title, message,
  send_email, send_sms, priority,
  scheduled_for, status,
  email_sent_at, email_delivered_at, email_failed_at, email_error_message,
  retry_count, context_data,
  created_at
) VALUES
  (v_uid, 'admin@rema.dev', 'low_stock',
   'Low stock: Neoprene', 'Neoprene has dropped below reorder threshold. Current stock: 180 sqft.',
   true, false, 'high',
   NOW() - INTERVAL '13 days', 'sent',
   NOW() - INTERVAL '13 days' + INTERVAL '2 minutes',
   NOW() - INTERVAL '13 days' + INTERVAL '3 minutes',
   NULL, NULL,
   0, '{"material": "Neoprene", "current_stock": 180, "threshold": 500}'::jsonb,
   NOW() - INTERVAL '13 days'),

  (v_uid, 'admin@rema.dev', 'reorder_triggered',
   'Reorder triggered: Butyl', 'Auto-reorder rule fired for Butyl. Draft PO-2024-0006 created.',
   true, false, 'normal',
   NOW() - INTERVAL '12 days', 'sent',
   NOW() - INTERVAL '12 days' + INTERVAL '1 minute',
   NOW() - INTERVAL '12 days' + INTERVAL '2 minutes',
   NULL, NULL,
   0, '{"material": "Butyl", "po_number": "PO-2024-0006"}'::jsonb,
   NOW() - INTERVAL '12 days'),

  (v_uid, 'admin@rema.dev', 'po_approved',
   'PO-2024-0008 approved', 'Purchase order PO-2024-0008 has been approved by admin@rema.dev.',
   true, false, 'normal',
   NOW() - INTERVAL '6 hours', 'sent',
   NOW() - INTERVAL '6 hours' + INTERVAL '1 minute',
   NOW() - INTERVAL '6 hours' + INTERVAL '2 minutes',
   NULL, NULL,
   0, '{"po_number": "PO-2024-0008", "total": 2497.55}'::jsonb,
   NOW() - INTERVAL '6 hours'),

  (v_uid, 'admin@rema.dev', 'delivery_received',
   'Delivery received: PO-2024-0005', 'Polyurethane shipment from Pacific Seal Co. received and QC-passed.',
   true, false, 'low',
   NOW() - INTERVAL '47 days', 'sent',
   NOW() - INTERVAL '47 days' + INTERVAL '5 minutes',
   NOW() - INTERVAL '47 days' + INTERVAL '6 minutes',
   NULL, NULL,
   0, '{"po_number": "PO-2024-0005", "supplier": "Pacific Seal Co."}'::jsonb,
   NOW() - INTERVAL '47 days'),

  (v_uid, 'admin@rema.dev', 'delivery_expected',
   'Delivery expected: PO-2024-0006', 'PO-2024-0006 (Butyl) expected to arrive in 2 days.',
   true, false, 'normal',
   NOW() + INTERVAL '1 day', 'pending',
   NULL, NULL, NULL, NULL,
   0, '{"po_number": "PO-2024-0006", "expected_date": "+2 days"}'::jsonb,
   NOW() - INTERVAL '2 hours'),

  (v_uid, 'admin@rema.dev', 'price_change',
   'Price change: Nitrile (NBR) +5.7%', 'NBR cost rose from $8.75 to $9.25 per sqft (Midwest Materials).',
   true, false, 'low',
   NOW() - INTERVAL '14 days', 'pending',
   NULL, NULL, NULL, NULL,
   0, '{"material": "Nitrile (NBR)", "old_price": 8.75, "new_price": 9.25, "pct": 5.7}'::jsonb,
   NOW() - INTERVAL '14 days'),

  (v_uid, 'admin@rema.dev', 'delivery_overdue',
   'Delivery overdue: PO-2024-0011', 'PO-2024-0011 has not arrived by the requested delivery date.',
   true, true, 'high',
   NOW() - INTERVAL '1 day', 'pending',
   NULL, NULL, NULL, NULL,
   0, '{"po_number": "PO-2024-0011", "days_overdue": 1}'::jsonb,
   NOW() - INTERVAL '1 day'),

  (v_uid, 'admin@rema.dev', 'po_created',
   'PO-2024-0007 created', 'Draft PO-2024-0007 created for EPDM commodity restock.',
   true, false, 'low',
   NOW() - INTERVAL '2 days', 'failed',
   NULL, NULL, NOW() - INTERVAL '2 days' + INTERVAL '30 seconds',
   'SMTP 421: temporary service unavailable',
   1, '{"po_number": "PO-2024-0007"}'::jsonb,
   NOW() - INTERVAL '2 days'),

  (v_uid, 'admin@rema.dev', 'low_stock',
   'Low stock: Hypalon', 'Hypalon near reorder point.',
   true, false, 'normal',
   NOW() - INTERVAL '6 days', 'failed',
   NULL, NULL, NOW() - INTERVAL '6 days' + INTERVAL '45 seconds',
   'Email bounced: mailbox temporarily full',
   1, '{"material": "Hypalon (CSM)", "current_stock": 180, "threshold": 250}'::jsonb,
   NOW() - INTERVAL '6 days'),

  (v_uid, 'admin@rema.dev', 'critical_alert',
   'PO-2024-0010 cancelled', 'PO-2024-0010 was cancelled — scope consolidated into PO-2024-0005.',
   true, false, 'critical',
   NOW() - INTERVAL '30 days', 'cancelled',
   NULL, NULL, NULL, NULL,
   0, '{"po_number": "PO-2024-0010", "reason": "consolidated"}'::jsonb,
   NOW() - INTERVAL '30 days');

-- ─────────────────────────────────────────────────────────────
-- 15. Cut history (nesting engine records)
--     id is SERIAL — don't set manually.
-- ─────────────────────────────────────────────────────────────

INSERT INTO cut_history (
  user_id,
  material_id, part_id,
  cut_length, cut_width, cut_thickness,
  part_custom_width, part_custom_height,
  part_selected_size, part_selected_size_text, part_selected_label,
  cut_amount,
  parts_completed, material_used_sqft,
  reusable_offset_sqft, scrap_sqft,
  fab_score, cut_pieces,
  cut_date
) VALUES
  (v_uid, 1, 1,  60.0,  48.0, 0.125, NULL, NULL,   ARRAY[1]::INT[],     ARRAY['12x24']::TEXT[],          ARRAY['Gasket A']::TEXT[],     10,  9, 18.40, 1.20, 0.40, 0.92, 10, NOW() - INTERVAL '88 days'),
  (v_uid, 2, 3,  72.0,  60.0, 0.063, NULL, NULL,   ARRAY[2,3]::INT[],   ARRAY['18x24','24x36']::TEXT[],  ARRAY['Seal B','Seal C']::TEXT[], 8, 8, 24.10, 0.80, 0.30, 0.95,  8, NOW() - INTERVAL '82 days'),
  (v_uid, 3, 2,  36.0,  36.0, 0.250, 10.0, 14.0,   ARRAY[4]::INT[],     ARRAY['Custom']::TEXT[],         ARRAY['Custom O-ring']::TEXT[],  6, 6,  8.75, 0.20, 0.15, 0.88,  6, NOW() - INTERVAL '78 days'),
  (v_uid, 1, 5,  48.0,  60.0, 0.125, NULL, NULL,   ARRAY[1,2]::INT[],   ARRAY['12x24','18x18']::TEXT[],  ARRAY['Gasket A','Pad D']::TEXT[], 12, 11, 20.00, 0.90, 0.50, 0.91, 12, NOW() - INTERVAL '70 days'),
  (v_uid, 4, 1,  30.0,  24.0, 0.063, NULL, NULL,   ARRAY[1]::INT[],     ARRAY['12x24']::TEXT[],          ARRAY['Gasket A']::TEXT[],        4,  4,  5.00, 0.10, 0.05, 0.94,  4, NOW() - INTERVAL '65 days'),
  (v_uid, 2, 4,  48.0,  48.0, 0.094, NULL, NULL,   ARRAY[3]::INT[],     ARRAY['24x36']::TEXT[],          ARRAY['Seal C']::TEXT[],          5,  5, 16.00, 0.50, 0.25, 0.93,  5, NOW() - INTERVAL '58 days'),
  (v_uid, 5, 2,  60.0,  36.0, 0.125, NULL, NULL,   ARRAY[2]::INT[],     ARRAY['18x24']::TEXT[],          ARRAY['Seal B']::TEXT[],         10,  9, 13.50, 1.00, 0.80, 0.87, 10, NOW() - INTERVAL '52 days'),
  (v_uid, 1, 3,  72.0,  72.0, 0.063, NULL, NULL,   ARRAY[1,2,3]::INT[], ARRAY['12x24','18x24','24x36']::TEXT[], ARRAY['Gasket A','Seal B','Seal C']::TEXT[], 15, 14, 32.80, 2.50, 1.20, 0.86, 15, NOW() - INTERVAL '46 days'),
  (v_uid, 3, 1,  24.0,  24.0, 0.250, NULL, NULL,   ARRAY[4]::INT[],     ARRAY['6x6']::TEXT[],            ARRAY['O-ring blank']::TEXT[],   20, 20,  5.00, 0.00, 0.00, 0.98, 20, NOW() - INTERVAL '41 days'),
  (v_uid, 2, 5,  48.0,  36.0, 0.032, NULL, NULL,   ARRAY[1]::INT[],     ARRAY['12x24']::TEXT[],          ARRAY['Gasket A']::TEXT[],        7,  7, 11.40, 0.30, 0.30, 0.92,  7, NOW() - INTERVAL '36 days'),
  (v_uid, 4, 2,  36.0,  48.0, 0.094, NULL, NULL,   ARRAY[2]::INT[],     ARRAY['18x24']::TEXT[],          ARRAY['Seal B']::TEXT[],          6,  6, 12.00, 0.20, 0.20, 0.90,  6, NOW() - INTERVAL '32 days'),
  (v_uid, 1, 1,  60.0,  48.0, 0.125, NULL, NULL,   ARRAY[1]::INT[],     ARRAY['12x24']::TEXT[],          ARRAY['Gasket A']::TEXT[],       10, 10, 19.00, 0.50, 0.50, 0.93, 10, NOW() - INTERVAL '28 days'),
  (v_uid, 6, 4,  48.0,  36.0, 0.063, 8.0, 12.0,    ARRAY[5]::INT[],     ARRAY['Custom']::TEXT[],         ARRAY['Hypalon patch']::TEXT[],   4,  4,  8.00, 0.10, 0.20, 0.89,  4, NOW() - INTERVAL '24 days'),
  (v_uid, 7, 2,  36.0,  60.0, 0.188, NULL, NULL,   ARRAY[3]::INT[],     ARRAY['24x36']::TEXT[],          ARRAY['Scraper']::TEXT[],         3,  3, 14.00, 0.25, 0.25, 0.94,  3, NOW() - INTERVAL '21 days'),
  (v_uid, 2, 1,  48.0,  60.0, 0.125, NULL, NULL,   ARRAY[1,2]::INT[],   ARRAY['12x24','18x18']::TEXT[],  ARRAY['Gasket A','Pad D']::TEXT[], 14, 13, 19.50, 0.60, 0.40, 0.91, 14, NOW() - INTERVAL '18 days'),
  (v_uid, 8, 3,  30.0,  48.0, 0.094, NULL, NULL,   ARRAY[2]::INT[],     ARRAY['18x24']::TEXT[],          ARRAY['Butyl pad']::TEXT[],       6,  6, 11.00, 0.20, 0.15, 0.93,  6, NOW() - INTERVAL '15 days'),
  (v_uid, 1, 5,  60.0,  48.0, 0.125, NULL, NULL,   ARRAY[1,3]::INT[],   ARRAY['12x24','24x36']::TEXT[],  ARRAY['Gasket A','Seal C']::TEXT[], 9, 9, 17.50, 0.50, 0.45, 0.92,  9, NOW() - INTERVAL '12 days'),
  (v_uid, 3, 2,  24.0,  36.0, 0.063, NULL, NULL,   ARRAY[4]::INT[],     ARRAY['6x6']::TEXT[],            ARRAY['Viton O-ring']::TEXT[],   18, 18,  4.50, 0.00, 0.05, 0.97, 18, NOW() - INTERVAL '10 days'),
  (v_uid, 5, 1,  72.0,  60.0, 0.125, NULL, NULL,   ARRAY[2,3]::INT[],   ARRAY['18x24','24x36']::TEXT[],  ARRAY['Seal B','Seal C']::TEXT[], 10, 10, 28.00, 1.20, 0.80, 0.90, 10, NOW() - INTERVAL '8 days'),
  (v_uid, 7, 4,  48.0,  36.0, 0.188, 12.0, 18.0,   ARRAY[5]::INT[],     ARRAY['Custom']::TEXT[],         ARRAY['Roller cover']::TEXT[],    2,  2,  8.50, 0.10, 0.40, 0.86,  2, NOW() - INTERVAL '6 days'),
  (v_uid, 2, 3,  48.0,  60.0, 0.125, NULL, NULL,   ARRAY[1,2]::INT[],   ARRAY['12x24','18x24']::TEXT[],  ARRAY['Gasket A','Seal B']::TEXT[], 11, 11, 20.40, 0.80, 0.30, 0.93, 11, NOW() - INTERVAL '4 days'),
  (v_uid, 8, 2,  36.0,  48.0, 0.094, NULL, NULL,   ARRAY[2]::INT[],     ARRAY['18x24']::TEXT[],          ARRAY['Butyl seal']::TEXT[],      5,  5, 10.80, 0.20, 0.20, 0.92,  5, NOW() - INTERVAL '3 days'),
  (v_uid, 1, 1,  48.0,  36.0, 0.125, NULL, NULL,   ARRAY[1]::INT[],     ARRAY['12x24']::TEXT[],          ARRAY['Gasket A']::TEXT[],        8,  8, 14.00, 0.40, 0.30, 0.94,  8, NOW() - INTERVAL '2 days'),
  (v_uid, 6, 5,  24.0,  36.0, 0.063, NULL, NULL,   ARRAY[5]::INT[],     ARRAY['Custom']::TEXT[],         ARRAY['Hypalon splash']::TEXT[],  1,  1,  6.00, 0.00, 0.20, 0.88,  1, NOW() - INTERVAL '1 days'),
  (v_uid, 3, 4,  24.0,  12.0, 0.063, NULL, NULL,   ARRAY[4]::INT[],     ARRAY['6x6']::TEXT[],            ARRAY['Viton dosing O']::TEXT[], 12, 12,  3.00, 0.00, 0.05, 0.96, 12, NOW() - INTERVAL '6 hours');

-- ─────────────────────────────────────────────────────────────
-- 16. Cut history favorites — favorite 6 most recent admin cuts
-- ─────────────────────────────────────────────────────────────

INSERT INTO cut_history_favorites (user_id, cut_history_id)
SELECT v_uid, id
  FROM cut_history
 WHERE user_id = v_uid
 ORDER BY cut_date DESC
 LIMIT 6
ON CONFLICT (user_id, cut_history_id) DO NOTHING;

END $$;
