-- =============================================================
-- seed.sql — Local development seed data (redesigned schema)
-- Run via: npm run supabase:reset
--
-- Creates:
--   • 1 tenant (Rema Industries) + tenant_settings
--   • 5 auth users: platform admin + admin/manager/cutter/viewer
--   • Memberships linking the 4 tenant-scoped users to the tenant
--   • Material types, suppliers, material_suppliers, rolls, cuts,
--     reorder_rules, purchase_orders + items, notifications,
--     cut_history + selection + favorites
--
-- Password for ALL accounts: Password123!
-- Platform admin: platform-admin@rema.dev   (bypasses tenant RLS)
-- Tenant users:   admin/manager/cutter/viewer @rema.dev
--
-- NOTE: Units throughout are storage units — mm, sqmm, cents.
--       Prices are bigint cents per square meter.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Auth users
-- ─────────────────────────────────────────────────────────────

INSERT INTO auth.users (
  instance_id, id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, aud, role,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES
  ('00000000-0000-0000-0000-000000000000',
   'ffffffff-0000-0000-0000-000000000001',
   'platform-admin@rema.dev',
   crypt('Password123!', gen_salt('bf')),
   NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Platform Admin"}'::jsonb,
   NOW(), NOW(), 'authenticated', 'authenticated', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'admin@rema.dev',
   crypt('Password123!', gen_salt('bf')),
   NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Admin User"}'::jsonb,
   NOW(), NOW(), 'authenticated', 'authenticated', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000002',
   'manager@rema.dev',
   crypt('Password123!', gen_salt('bf')),
   NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Manager User"}'::jsonb,
   NOW(), NOW(), 'authenticated', 'authenticated', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000003',
   'cutter@rema.dev',
   crypt('Password123!', gen_salt('bf')),
   NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Cutter User"}'::jsonb,
   NOW(), NOW(), 'authenticated', 'authenticated', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-000000000004',
   'viewer@rema.dev',
   crypt('Password123!', gen_salt('bf')),
   NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Viewer User"}'::jsonb,
   NOW(), NOW(), 'authenticated', 'authenticated', '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. auth.identities
-- ─────────────────────────────────────────────────────────────

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  NOW(), NOW(), NOW()
FROM auth.users u
WHERE u.id IN (
  'ffffffff-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000004'
)
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. Profiles
--    (No handle_new_user trigger in the redesign, so inserted manually.)
-- ─────────────────────────────────────────────────────────────

INSERT INTO profiles (id, first_name, last_name, email, is_platform_admin) VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'Platform', 'Admin',   'platform-admin@rema.dev', true),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Admin',    'User',    'admin@rema.dev',          false),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Manager',  'User',    'manager@rema.dev',        false),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Cutter',   'User',    'cutter@rema.dev',         false),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Viewer',   'User',    'viewer@rema.dev',         false)
ON CONFLICT (id) DO UPDATE
  SET is_platform_admin = EXCLUDED.is_platform_admin,
      first_name = EXCLUDED.first_name,
      last_name  = EXCLUDED.last_name,
      email      = EXCLUDED.email;

-- ─────────────────────────────────────────────────────────────
-- 4. Tenant + settings
-- ─────────────────────────────────────────────────────────────

INSERT INTO tenants (id, name, slug) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Rema Industries', 'rema-industries')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant_settings (tenant_id, default_currency, unit_system, timezone) VALUES
  ('11111111-0000-0000-0000-000000000001', 'USD', 'imperial', 'America/New_York')
ON CONFLICT (tenant_id) DO UPDATE
  SET default_currency = EXCLUDED.default_currency,
      unit_system      = EXCLUDED.unit_system,
      timezone         = EXCLUDED.timezone;

-- ─────────────────────────────────────────────────────────────
-- 5. Memberships — link users to the tenant with their roles
--    Platform admin does NOT get a membership — they bypass RLS
--    via profiles.is_platform_admin. (Add one here if the UI
--    requires a current-tenant context for platform admin too.)
-- ─────────────────────────────────────────────────────────────

INSERT INTO memberships (tenant_id, profile_id, roles) VALUES
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', ARRAY['admin']::text[]),
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', ARRAY['manager']::text[]),
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', ARRAY['cutter']::text[]),
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', ARRAY['viewer']::text[]),
  -- Give the platform admin admin membership too, so they can act within a tenant for writes.
  ('11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', ARRAY['admin']::text[])
ON CONFLICT (tenant_id, profile_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Disable triggers that would otherwise fire during bulk seed
-- (cuts would re-decrement rolls; rolls update would spam
-- notifications; we seed both states directly).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE cuts  DISABLE TRIGGER trg_cuts_decrement_roll_and_notify;
ALTER TABLE rolls DISABLE TRIGGER trg_rolls_notify_depleted;
ALTER TABLE rolls DISABLE TRIGGER trg_rolls_notify_low_stock;
ALTER TABLE rolls DISABLE TRIGGER trg_rolls_auto_deplete;

-- ─────────────────────────────────────────────────────────────
-- 6. Material types
-- ─────────────────────────────────────────────────────────────
-- IDs use prefix bbbbbbbb-
-- min_stock_sqm thresholds drive the low-stock aggregate alert.

INSERT INTO material_types (id, tenant_id, name, description, min_stock_sqm, created_by) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'Neoprene',
   'General-purpose synthetic rubber. Weather, oil, and flame resistant.',
   45.0, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'EPDM',
   'Ethylene Propylene Diene Monomer. UV and ozone resistant; roofing grade.',
   70.0, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'Silicone',
   'High-temperature synthetic rubber. Food-safe grades available.',
   28.0, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'Viton (FKM)',
   'Fluoroelastomer with outstanding chemical and heat resistance.',
   19.0, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'Nitrile (NBR)',
   'Excellent oil and fuel resistance. Standard automotive seal material.',
   56.0, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'Hypalon (CSM)',
   'Chlorosulfonated polyethylene. Chemical and UV resistant.',
   23.0, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001',
   'Polyurethane',
   'Abrasion-resistant elastomer with excellent tear strength.',
   32.0, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001',
   'Butyl',
   'Isobutylene isoprene rubber. Exceptional gas impermeability.',
   37.0, 'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 7. Suppliers — each supplier gets a billing/shipping address
-- ─────────────────────────────────────────────────────────────

INSERT INTO addresses (id, tenant_id, address_line1, city, state, postal_code, country, created_by) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   '1234 Industrial Blvd', 'Cleveland',   'OH', '44101', 'United States', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   '5678 Manufacturing Ave', 'Chicago',   'IL', '60601', 'United States', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   '9012 Warehouse Way', 'Detroit',       'MI', '48201', 'United States', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   '3456 Research Parkway', 'Akron',      'OH', '44301', 'United States', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   '7890 Bayport Drive', 'Houston',       'TX', '77029', 'United States', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   '2020 Waterfront Ave', 'Seattle',      'WA', '98101', 'United States', 'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO suppliers (
  id, tenant_id, name, address_id,
  email, general_phone, website,
  tax_id, tax_rate, tax_exempt,
  currency, payment_terms, shipping_cost_cents,
  rating, preferred, active, notes,
  created_by
) VALUES
  ('cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'Premium Rubber Supply Co.', 'a0000000-0000-0000-0000-000000000001',
   'orders@premiumrubber.com', '+18005550101', 'https://www.premiumrubber.com',
   'EIN-12-3456789', 0.0800, false,
   'USD', 'Net 30', 7500,
   5, true, true,
   'Primary supplier. Consistent quality and reliable lead times.',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'Midwest Materials Inc.', 'a0000000-0000-0000-0000-000000000002',
   'orders@midwestmaterials.com', '+18005550102', 'https://www.midwestmaterials.com',
   'EIN-22-3456789', 0.1025, false,
   'USD', '2/10 Net 30', 5000,
   4, true, true,
   'Good pricing on EPDM and NBR. 2% discount if paid within 10 days.',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'Budget Rubber Warehouse', 'a0000000-0000-0000-0000-000000000003',
   'orders@budgetrubber.com', '+18005550103', 'https://www.budgetrubber.com',
   'EIN-33-3456789', 0.0600, false,
   'USD', 'Net 45', 3500,
   3, false, true,
   'Use for high-volume commodity orders only.',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'Specialty Elastomers Ltd.', 'a0000000-0000-0000-0000-000000000004',
   'orders@specialtyelastomers.com', '+18005550104', 'https://www.specialtyelastomers.com',
   'EIN-44-3456789', 0.0800, false,
   'USD', 'Net 30', 10000,
   5, true, true,
   'Sole source for Viton and medical-grade silicone.',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'Gulf Coast Rubber', 'a0000000-0000-0000-0000-000000000005',
   'orders@gulfcoastrubber.com', '+18005550105', 'https://www.gulfcoastrubber.com',
   'EIN-55-3456789', 0.0825, false,
   'USD', 'Net 30', 6000,
   4, false, true,
   'Strong on Hypalon and chemical-resistant stock.',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'Pacific Seal Co.', 'a0000000-0000-0000-0000-000000000006',
   'orders@pacificseal.com', '+18005550106', 'https://www.pacificseal.com',
   'EIN-66-3456789', 0.0650, false,
   'USD', 'Net 30', 12000,
   5, true, true,
   'Polyurethane specialists. Import-grade stock with full traceability.',
   'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 8. Material-supplier catalog
--    cost_per_sqm_cents: integer cents per square meter.
--    e.g., $134.55/sqm ≈ 13455 cents/sqm (≈ $12.50/sqft)
-- ─────────────────────────────────────────────────────────────

INSERT INTO material_suppliers (
  id, tenant_id, material_type_id, supplier_id,
  supplier_material_code, cost_per_sqm_cents,
  minimum_order_sqm, lead_time_days,
  preferred_supplier, active, effective_date,
  created_by
) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'PRS-NEO-001', 13455, 46.5, 7, true, true,
   CURRENT_DATE - INTERVAL '90 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002',
   'MMI-NEO-002', 12648, 69.7, 10, false, true,
   CURRENT_DATE - INTERVAL '60 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
   'PRS-EPD-001',  9418, 69.7, 7, true, true,
   CURRENT_DATE - INTERVAL '90 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003',
   'BRW-EPD-003',  7968, 92.9, 14, false, true,
   CURRENT_DATE - INTERVAL '30 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000004',
   'SEL-SIL-001', 16414, 27.9, 5, true, true,
   CURRENT_DATE - INTERVAL '90 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000004',
   'SEL-VIT-001', 30677, 18.6, 5, true, true,
   CURRENT_DATE - INTERVAL '90 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000002',
   'MMI-NBR-003',  9956, 46.5, 10, true, true,
   CURRENT_DATE - INTERVAL '90 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000005',
   'GCR-HYP-001', 20346, 23.2, 9, true, true,
   CURRENT_DATE - INTERVAL '60 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-000000000006',
   'PSC-PU-001',  23033, 18.6, 12, true, true,
   CURRENT_DATE - INTERVAL '60 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000005',
   'GCR-BUT-001', 12702, 37.2, 9, true, true,
   CURRENT_DATE - INTERVAL '60 days', 'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (material_type_id, supplier_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 9. Rolls — dimensions in mm, costs cents/sqm
--    Clean round-number dimensions for readability.
-- ─────────────────────────────────────────────────────────────

INSERT INTO rolls (
  id, tenant_id, material_type_id, supplier_id,
  source_type, width_mm, length_mm, remaining_length_mm,
  thickness_mm, color, location, date_received,
  cost_per_sqm_cents, status, notes, created_by
) VALUES
  -- Neoprene
  ('dddddddd-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'received', 1524, 15240, 12192, 3.175, 'Black', 'Rack A-1',
   CURRENT_DATE - INTERVAL '45 days', 13455, 'active',
   'Standard 1/8" sheet. High-volume stock.',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'received', 1219, 7620, 7620, 6.350, 'Black', 'Rack A-2',
   CURRENT_DATE - INTERVAL '20 days', 15884, 'active',
   '1/4" thick. Received full — no cuts yet.',
   'aaaaaaaa-0000-0000-0000-000000000001'),

  -- EPDM
  ('dddddddd-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002',
   'received', 1829, 18288, 13716, 1.588, 'Black', 'Rack B-1',
   CURRENT_DATE - INTERVAL '60 days', 9418, 'active',
   '1/16" roofing grade. Roughly 25% consumed.',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003',
   'received', 1524, 12192, 12192, 3.175, 'Black', 'Rack B-2',
   CURRENT_DATE - INTERVAL '10 days', 8503, 'active',
   'Budget grade. Monitor quality on first use.',
   'aaaaaaaa-0000-0000-0000-000000000001'),

  -- Silicone
  ('dddddddd-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000004',
   'received', 914, 6096, 4572, 3.175, 'Red', 'Rack C-1',
   CURRENT_DATE - INTERVAL '30 days', 16414, 'active',
   'Red silicone. High-temp application stock.',
   'aaaaaaaa-0000-0000-0000-000000000001'),

  -- Viton
  ('dddddddd-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000004',
   'received', 610, 3048, 2438, 1.588, 'Black', 'Rack D-1',
   CURRENT_DATE - INTERVAL '15 days', 30677, 'active',
   'FKM fluoroelastomer. Keep sealed until use.',
   'aaaaaaaa-0000-0000-0000-000000000001'),

  -- NBR
  ('dddddddd-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000002',
   'received', 1524, 12192, 3048, 3.175, 'Black', 'Rack E-1',
   CURRENT_DATE - INTERVAL '50 days', 9956, 'active',
   'Running low — reorder triggered.',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000002',
   'received', 1524, 15240, 15240, 1.588, 'Black', 'Rack E-2',
   CURRENT_DATE - INTERVAL '5 days', 9687, 'reserved',
   'Reserved for Job J-2024-0088.',
   'aaaaaaaa-0000-0000-0000-000000000001'),

  -- Hypalon
  ('dddddddd-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000005',
   'received', 1219, 6096, 4572, 1.588, 'Gray', 'Rack F-1',
   CURRENT_DATE - INTERVAL '40 days', 20346, 'active',
   'Gray Hypalon — acid tank lining stock.',
   'aaaaaaaa-0000-0000-0000-000000000001'),

  -- Polyurethane
  ('dddddddd-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-000000000006',
   'received', 1524, 7620, 3048, 4.763, 'Amber', 'Rack G-1',
   CURRENT_DATE - INTERVAL '55 days', 23033, 'active',
   'Amber 80A durometer. Conveyor scraper stock.',
   'aaaaaaaa-0000-0000-0000-000000000001'),

  -- Butyl
  ('dddddddd-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000005',
   'received', 1219, 7620, 6604, 2.381, 'Black', 'Rack H-1',
   CURRENT_DATE - INTERVAL '48 days', 12702, 'active',
   'Standard butyl sheet. Gas-impermeable vapor seal use.',
   'aaaaaaaa-0000-0000-0000-000000000001'),

  -- Depleted roll (for the UI to show mixed statuses)
  ('dddddddd-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'received', 914, 12192, 0, 9.525, 'Black', 'Rack A-4',
   CURRENT_DATE - INTERVAL '110 days', 18087, 'depleted',
   '3/8" thick. Depleted Q1 — awaiting archive.',
   'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 10. Cuts — sample cut records against seeded rolls
-- ─────────────────────────────────────────────────────────────

INSERT INTO cuts (
  id, tenant_id, roll_id,
  cut_width_mm, cut_length_mm, quantity,
  waste_sqmm, waste_percentage, total_sqmm_used,
  job_reference, cut_by, notes, created_at, created_by
) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   305, 610, 10, 516000, 4.20, 12900000,
   'J-2024-0071', 'aaaaaaaa-0000-0000-0000-000000000003',
   'Gaskets for hydraulic manifold assembly.',
   NOW() - INTERVAL '40 days', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   457, 914, 4, 312000, 3.10, 10200000,
   'J-2024-0074', 'aaaaaaaa-0000-0000-0000-000000000003',
   'Vibration damping pads.',
   NOW() - INTERVAL '35 days', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000003',
   610, 1219, 6, 745000, 5.00, 16700000,
   'J-2024-0065', 'aaaaaaaa-0000-0000-0000-000000000003',
   'Outdoor weatherstrip seals.',
   NOW() - INTERVAL '55 days', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000005',
   305, 305, 8, 140000, 2.30, 7450000,
   'J-2024-0080', 'aaaaaaaa-0000-0000-0000-000000000003',
   'High-temp oven door seals.',
   NOW() - INTERVAL '22 days', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000006',
   152, 152, 12, 115000, 4.00, 2880000,
   'J-2024-0083', 'aaaaaaaa-0000-0000-0000-000000000003',
   'Chemical-resistant O-ring blanks.',
   NOW() - INTERVAL '12 days', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000007',
   610, 914, 8, 1010000, 5.60, 18000000,
   'J-2024-0075', 'aaaaaaaa-0000-0000-0000-000000000003',
   'Automotive valve stem seals.',
   NOW() - INTERVAL '32 days', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000009',
   610, 914, 2, 265000, 3.50, 7590000,
   'J-2024-0070', 'aaaaaaaa-0000-0000-0000-000000000003',
   'Chemical tank liner sample.',
   NOW() - INTERVAL '28 days', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000010',
   457, 914, 3, 340000, 3.80, 8940000,
   'J-2024-0073', 'aaaaaaaa-0000-0000-0000-000000000003',
   'Conveyor scraper blades.',
   NOW() - INTERVAL '15 days', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000011',
   610, 914, 4, 480000, 3.50, 14500000,
   'J-2024-0076', 'aaaaaaaa-0000-0000-0000-000000000003',
   'Vapor barrier pads.',
   NOW() - INTERVAL '6 days', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   305, 406, 18, 310000, 2.20, 14500000,
   'J-2024-0106', 'aaaaaaaa-0000-0000-0000-000000000003',
   'Small vibration isolators.',
   NOW() - INTERVAL '5 days', 'aaaaaaaa-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 11. Price history (immutable log — no updated_at)
--     price_change_percentage populated by trigger (file 8).
-- ─────────────────────────────────────────────────────────────

INSERT INTO price_history (
  id, tenant_id, material_supplier_id,
  old_cost_per_sqm_cents, new_cost_per_sqm_cents,
  change_reason, effective_date, changed_by, created_at
) VALUES
  ('70000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000001',
   12109, 13455, 'Raw material cost increase (Q1)',
   CURRENT_DATE - INTERVAL '90 days', 'aaaaaaaa-0000-0000-0000-000000000001',
   NOW() - INTERVAL '90 days'),
  ('70000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000003',
   8611, 9418, 'Supplier annual price adjustment',
   CURRENT_DATE - INTERVAL '75 days', 'aaaaaaaa-0000-0000-0000-000000000001',
   NOW() - INTERVAL '75 days'),
  ('70000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000005',
   15606, 16414, 'Silicone feedstock shortage surcharge',
   CURRENT_DATE - INTERVAL '60 days', 'aaaaaaaa-0000-0000-0000-000000000001',
   NOW() - INTERVAL '60 days'),
  ('70000000-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000007',
   9418, 9956, 'Butadiene market price increase',
   CURRENT_DATE - INTERVAL '14 days', 'aaaaaaaa-0000-0000-0000-000000000001',
   NOW() - INTERVAL '14 days');

-- ─────────────────────────────────────────────────────────────
-- 12. Reorder rules — one per material_type
-- ─────────────────────────────────────────────────────────────

INSERT INTO reorder_rules (
  id, tenant_id, material_type_id, supplier_id,
  reorder_point_sqm, reorder_quantity_sqm, max_stock_level_sqm,
  lead_time_days, safety_stock_days,
  auto_reorder, active, created_by
) VALUES
  ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   46.5, 139.4, 278.7, 7, 3, true, true, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
   69.7, 185.8, 371.6, 7, 3, true, true, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000004',
   27.9, 83.6, 167.2, 5, 2, false, true, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000004',
   18.6, 55.7, 111.5, 5, 2, false, true, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000002',
   55.7, 139.4, 278.7, 10, 4, true, true, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000005',
   23.2, 69.7, 139.4, 9, 3, false, true, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-000000000006',
   32.5, 92.9, 185.8, 12, 4, false, true, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000005',
   37.2, 111.5, 223.0, 9, 3, true, true, 'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (material_type_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 13. Purchase orders (+ items)
-- ─────────────────────────────────────────────────────────────

INSERT INTO purchase_orders (
  id, tenant_id, supplier_id,
  po_number, status,
  order_date, requested_delivery_date, actual_delivery_date,
  currency,
  subtotal_cents, tax_amount_cents, shipping_cost_cents, total_amount_cents,
  payment_terms, notes,
  auto_generated, approved_by, approved_at,
  created_by
) VALUES
  ('f0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001',
   'PO-2024-0001', 'received',
   CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '23 days', CURRENT_DATE - INTERVAL '22 days',
   'USD', 250000, 20000, 7500, 277500,
   'Net 30', 'Routine neoprene restock. Received on time.',
   false, 'aaaaaaaa-0000-0000-0000-000000000001', NOW() - INTERVAL '29 days',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000002',
   'PO-2024-0002', 'approved',
   CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '5 days', NULL,
   'USD', 185000, 14800, 5000, 204800,
   '2/10 Net 30', 'NBR restock. Pay early for 2% discount.',
   false, 'aaaaaaaa-0000-0000-0000-000000000001', NOW() - INTERVAL '4 days',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000004',
   'PO-2024-0003', 'draft',
   NULL, NULL, NULL,
   'USD', 427500, 34200, 10000, 471700,
   'Net 30', 'Auto-generated for Viton + Silicone. Awaiting approval.',
   true, NULL, NULL,
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000005',
   'PO-2024-0004', 'ordered',
   CURRENT_DATE - INTERVAL '12 days', CURRENT_DATE + INTERVAL '2 days', NULL,
   'USD', 283200, 23364, 6000, 312564,
   'Net 30', 'Auto-reorder for Butyl. Awaiting delivery.',
   true, 'aaaaaaaa-0000-0000-0000-000000000001', NOW() - INTERVAL '11 days',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000006',
   'PO-2024-0005', 'ordered',
   CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE + INTERVAL '6 days', NULL,
   'USD', 428000, 27820, 12000, 467820,
   'Net 30', 'Polyurethane Q2 replenishment.',
   false, 'aaaaaaaa-0000-0000-0000-000000000001', NOW() - INTERVAL '5 days',
   'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id, po_number) DO NOTHING;

INSERT INTO purchase_order_items (
  id, tenant_id, purchase_order_id, material_type_id,
  line_number, description,
  width_mm, length_mm, thickness_mm, color,
  quantity_sqm, quantity_received_sqm,
  unit_cost_cents, line_total_cents,
  received_date, created_by
) VALUES
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   1, 'Neoprene 1/8" Black 60" wide',
   1524, 10160, 3.175, 'Black', 18.58, 18.58,
   13455, 250000, CURRENT_DATE - INTERVAL '22 days',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000005',
   1, 'Nitrile NBR 1/8" Black 60" wide',
   1524, 10160, 3.175, 'Black', 18.58, 0,
   9956, 185000, NULL,
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000004',
   1, 'Viton FKM 1/16" Black 24" wide',
   610, 2540, 1.588, 'Black', 6.97, 0,
   30677, 213800, NULL,
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000003',
   2, 'Silicone Red 1/8" 36" wide',
   914, 5080, 3.175, 'Red', 13.01, 0,
   16414, 213700, NULL,
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000008',
   1, 'Butyl 3/32" Black 48" wide',
   1219, 7620, 2.381, 'Black', 22.29, 0,
   12702, 283200, NULL,
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000007',
   1, 'Polyurethane 3/16" Amber 60" wide',
   1524, 10160, 4.763, 'Amber', 18.58, 0,
   23033, 428000, NULL,
   'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (purchase_order_id, line_number) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 14. User preferences — notification_preferences on admin
--     (replaces the old notification_preferences table)
-- ─────────────────────────────────────────────────────────────

INSERT INTO user_preferences (profile_id, notification_preferences, ui_preferences)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001',
   jsonb_build_object(
     'lowStock',      jsonb_build_object('enabled', true),
     'rollDepleted',  jsonb_build_object('enabled', true),
     'cutCompleted',  jsonb_build_object('enabled', true),
     'systemAlert',   jsonb_build_object('enabled', true),
     'channels',      jsonb_build_object('email', true, 'sms', false),
     'quietHours',    jsonb_build_object('start', '22:00', 'end', '07:00', 'timezone', 'America/New_York')
   ),
   jsonb_build_object('unit_system', 'imperial'))
ON CONFLICT (profile_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 15. In-app notifications feed (admin)
-- ─────────────────────────────────────────────────────────────

INSERT INTO notifications (
  id, tenant_id, user_id, type, title, description,
  material_type, current_value, threshold_value,
  is_read, read_at, created_at
) VALUES
  ('55555555-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'low_stock', 'Neoprene running low',
   'Neoprene stock has dropped below the reorder threshold.',
   'Neoprene', 18.58, 46.5, false, NULL, NOW() - INTERVAL '13 days'),
  ('55555555-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'low_stock', 'Nitrile (NBR) below safety stock',
   'NBR thin-gauge critically low. PO-2024-0002 in flight.',
   'Nitrile (NBR)', 13.94, 55.7, true, NOW() - INTERVAL '9 days', NOW() - INTERVAL '10 days'),
  ('55555555-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'roll_depleted', 'Roll Rack A-4 depleted',
   'Neoprene roll on Rack A-4 has reached zero remaining length.',
   'Neoprene', 0.0, NULL, true, NOW() - INTERVAL '45 days', NOW() - INTERVAL '48 days'),
  ('55555555-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'cut_completed', 'Job J-2024-0106 completed',
   'Small vibration isolator cuts completed.',
   'Neoprene', 14.5, NULL, false, NULL, NOW() - INTERVAL '5 days'),
  ('55555555-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'system_alert', 'Auto-reorder triggered: Butyl',
   'Reorder rule fired. Draft PO-2024-0004 created.',
   'Butyl', NULL, NULL, true, NOW() - INTERVAL '11 days', NOW() - INTERVAL '12 days')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 16. Notification queue (email/SMS dispatch)
-- ─────────────────────────────────────────────────────────────

INSERT INTO notification_queue (
  id, tenant_id, user_id, notification_type,
  title, message,
  send_email, send_sms, priority, scheduled_for, status,
  email_sent_at, email_delivered_at,
  retry_count, context_data, created_at
) VALUES
  ('60000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'low_stock',
   'Low stock: Neoprene', 'Neoprene has dropped below reorder threshold.',
   true, false, 'high', NOW() - INTERVAL '13 days', 'sent',
   NOW() - INTERVAL '13 days' + INTERVAL '2 minutes',
   NOW() - INTERVAL '13 days' + INTERVAL '3 minutes',
   0, '{"material":"Neoprene","current_stock_sqm":18.58,"threshold_sqm":46.5}'::jsonb,
   NOW() - INTERVAL '13 days'),
  ('60000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'reorder_triggered',
   'Reorder triggered: Butyl', 'Draft PO-2024-0004 created.',
   true, false, 'normal', NOW() - INTERVAL '12 days', 'sent',
   NOW() - INTERVAL '12 days' + INTERVAL '1 minute',
   NOW() - INTERVAL '12 days' + INTERVAL '2 minutes',
   0, '{"material":"Butyl","po_number":"PO-2024-0004"}'::jsonb,
   NOW() - INTERVAL '12 days'),
  ('60000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'delivery_expected',
   'Delivery expected: PO-2024-0004', 'PO-2024-0004 expected in 2 days.',
   true, false, 'normal', NOW() + INTERVAL '1 day', 'pending',
   NULL, NULL,
   0, '{"po_number":"PO-2024-0004"}'::jsonb,
   NOW() - INTERVAL '2 hours')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 17. Cut history — with selection rows (replaces legacy arrays)
-- ─────────────────────────────────────────────────────────────

INSERT INTO cut_history (
  id, tenant_id, user_id, material_type_id,
  cut_length_mm, cut_width_mm, cut_thickness_mm,
  cut_amount, parts_completed, cut_pieces,
  material_used_sqmm, scrap_sqmm,
  fab_score, cost_per_sqm_cents,
  stock_label, cut_date, created_by
) VALUES
  ('66666666-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001',
   1524, 1219, 3.175, 10, 9, 10,
   1710000, 37200, 0.9200, 13455,
   '60" × 48" Neoprene', NOW() - INTERVAL '88 days',
   'aaaaaaaa-0000-0000-0000-000000000003'),
  ('66666666-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002',
   1829, 1524, 1.588, 8, 8, 8,
   2240000, 28000, 0.9500, 9418,
   '72" × 60" EPDM', NOW() - INTERVAL '82 days',
   'aaaaaaaa-0000-0000-0000-000000000003'),
  ('66666666-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000003',
   914, 914, 6.350, 6, 6, 6,
   813000, 14000, 0.8800, 16414,
   '36" × 36" Silicone (custom)', NOW() - INTERVAL '78 days',
   'aaaaaaaa-0000-0000-0000-000000000003'),
  ('66666666-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000004',
   610, 610, 1.588, 12, 12, 12,
   465000, 5000, 0.9800, 30677,
   '24" × 24" Viton O-ring blanks', NOW() - INTERVAL '12 days',
   'aaaaaaaa-0000-0000-0000-000000000003'),
  ('66666666-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000005',
   914, 914, 3.175, 15, 14, 15,
   3050000, 48000, 0.9300, 9956,
   '36" × 36" NBR', NOW() - INTERVAL '5 days',
   'aaaaaaaa-0000-0000-0000-000000000003'),
  ('66666666-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001',
   1524, 1219, 3.175, 10, 10, 10,
   1760000, 45000, 0.9400, 13455,
   '60" × 48" Neoprene', NOW() - INTERVAL '2 days',
   'aaaaaaaa-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO cut_history_selection (
  tenant_id, cut_history_id, selection_index,
  size_value, size_text, label, created_by
) VALUES
  ('11111111-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', 0, 1, '12x24', 'Gasket A', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('11111111-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 0, 2, '18x24', 'Seal B', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('11111111-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 1, 3, '24x36', 'Seal C', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('11111111-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000003', 0, 4, 'Custom', 'Custom O-ring', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('11111111-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000004', 0, 5, '6x6', 'O-ring blank', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('11111111-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000005', 0, 1, '12x24', 'Gasket A', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('11111111-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000006', 0, 1, '12x24', 'Gasket A', 'aaaaaaaa-0000-0000-0000-000000000003')
ON CONFLICT (cut_history_id, selection_index) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 18. Cut favorites (renamed from cut_history_favorites)
-- ─────────────────────────────────────────────────────────────

INSERT INTO cut_favorites (tenant_id, user_id, cut_history_id, created_by)
VALUES
  ('11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   '66666666-0000-0000-0000-000000000006',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   '66666666-0000-0000-0000-000000000004',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   '66666666-0000-0000-0000-000000000005',
   'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (user_id, cut_history_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Re-enable triggers
-- ─────────────────────────────────────────────────────────────

ALTER TABLE cuts  ENABLE TRIGGER trg_cuts_decrement_roll_and_notify;
ALTER TABLE rolls ENABLE TRIGGER trg_rolls_notify_depleted;
ALTER TABLE rolls ENABLE TRIGGER trg_rolls_notify_low_stock;
ALTER TABLE rolls ENABLE TRIGGER trg_rolls_auto_deplete;
