-- ============================================================================
-- Dev seed: users + tenant + operational data for local development.
-- ============================================================================
-- Auto-run by `supabase db reset` (Supabase CLI picks up this file from the
-- project's `supabase/seed.sql` path). Edit the constants below if you want
-- different emails/passwords; the seed has no env-var overrides since
-- supabase db reset invokes it as raw SQL.
--
-- Block 1: tenant + 6 role-scoped auth users (one per RBAC role).
-- Block 2: operational data (materials, suppliers, rolls, cuts, POs).
-- All operational rows scoped to the dev tenant and owned by admin user.
-- Adapted from dev branch's `seed_demo.sql` with imperial→metric and
-- user_id→tenant_id+created_by conversions handled inline at insert time.

-- ─────────────────────────────────────────────────────────────────────────────
-- Block 1 — Tenant + users
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tenant_id     uuid;
  v_password_hash text := crypt('changeme123', gen_salt('bf'));
  v_user          record;
BEGIN
  INSERT INTO public.tenants (name, slug, status)
  VALUES ('Dev Tenant', 'dev-tenant', 'active')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_settings (tenant_id)
  VALUES (v_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  FOR v_user IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-00000000a001'::uuid, 'admin',      'admin@rema.local'),
      ('00000000-0000-0000-0000-00000000a002'::uuid, 'manager',    'manager@rema.local'),
      ('00000000-0000-0000-0000-00000000a003'::uuid, 'supervisor', 'supervisor@rema.local'),
      ('00000000-0000-0000-0000-00000000a004'::uuid, 'cutter',     'cutter@rema.local'),
      ('00000000-0000-0000-0000-00000000a005'::uuid, 'member',     'member@rema.local'),
      ('00000000-0000-0000-0000-00000000a006'::uuid, 'viewer',     'viewer@rema.local')
    ) AS t(uid, role, email)
  LOOP
    -- auth.users — `email_confirmed_at` set so login bypasses email
    -- confirmation. `confirmed_at` is a generated column computed from
    -- LEAST(email_confirmed_at, phone_confirmed_at) — do not insert it.
    -- Token columns are nullable in the schema but GoTrue scans them
    -- into non-nullable Go strings, so we explicitly seed empty strings.
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      v_user.uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      v_user.email,
      v_password_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    ) ON CONFLICT (id) DO NOTHING;

    -- auth.identities — required by GoTrue for the email-provider sign-in
    -- path. Unique on (provider_id, provider); provider_id is the user id
    -- as text for the 'email' provider.
    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider,
      created_at, updated_at
    ) VALUES (
      v_user.uid::text,
      v_user.uid,
      jsonb_build_object(
        'sub', v_user.uid::text,
        'email', v_user.email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(), now()
    ) ON CONFLICT (provider_id, provider) DO NOTHING;

    INSERT INTO public.profiles (id, email, is_platform_admin, last_active_tenant_id)
    VALUES (v_user.uid, v_user.email, false, v_tenant_id)
    ON CONFLICT (id) DO UPDATE
      SET last_active_tenant_id = EXCLUDED.last_active_tenant_id;

    INSERT INTO public.memberships (profile_id, tenant_id, roles)
    VALUES (v_user.uid, v_tenant_id, ARRAY[v_user.role])
    ON CONFLICT (tenant_id, profile_id) DO UPDATE
      SET roles = EXCLUDED.roles, deleted_at = NULL;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Block 2 — Operational data (adapted from dev `seed_demo.sql`)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Unit conversions are computed inline at INSERT time so the dev source
-- numbers stay readable next to the column they fill. Reference formulas:
--   inches → mm:       ROUND(in * 25.4)                  (integer mm)
--   inches → mm (3dp): ROUND(in * 25.4, 3)               (thickness, numeric 8,3)
--   sqft   → sqm:      ROUND(sqft / 10.7639, 3)          (numeric 12,3)
--   sqft   → sqmm:     ROUND(sqft * 92903.04)            (bigint square millimetres)
--   USD/sqft → cents/sqm: ROUND(usd_per_sqft * 10.7639 * 100)  (bigint)
--   USD    → cents:    ROUND(usd * 100)                  (bigint)
--
-- All rows are tagged tenant_id = "Dev Tenant" and created_by = admin user.

DO $$
DECLARE
  v_tenant_id   uuid;
  v_admin_id    uuid;

  -- Material type UUIDs (stable seed identifiers)
  mt_neoprene   uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  mt_epdm       uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  mt_silicone   uuid := 'bbbbbbbb-0000-0000-0000-000000000003';
  mt_viton      uuid := 'bbbbbbbb-0000-0000-0000-000000000004';
  mt_nbr        uuid := 'bbbbbbbb-0000-0000-0000-000000000005';
  mt_hypalon    uuid := 'bbbbbbbb-0000-0000-0000-000000000006';
  mt_poly       uuid := 'bbbbbbbb-0000-0000-0000-000000000007';
  mt_butyl      uuid := 'bbbbbbbb-0000-0000-0000-000000000008';

  -- Supplier UUIDs
  sup_premium   uuid := 'cccccccc-0000-0000-0000-000000000001';
  sup_midwest   uuid := 'cccccccc-0000-0000-0000-000000000002';
  sup_budget    uuid := 'cccccccc-0000-0000-0000-000000000003';
  sup_specialty uuid := 'cccccccc-0000-0000-0000-000000000004';
  sup_gulf      uuid := 'cccccccc-0000-0000-0000-000000000005';
  sup_pacific   uuid := 'cccccccc-0000-0000-0000-000000000006';

  -- Roll UUIDs
  roll_neo_1    uuid := 'dddddddd-0000-0000-0000-000000000001';
  roll_neo_2    uuid := 'dddddddd-0000-0000-0000-000000000002';
  roll_epdm_1   uuid := 'dddddddd-0000-0000-0000-000000000003';
  roll_epdm_2   uuid := 'dddddddd-0000-0000-0000-000000000004';
  roll_sil_1    uuid := 'dddddddd-0000-0000-0000-000000000005';
  roll_viton_1  uuid := 'dddddddd-0000-0000-0000-000000000006';
  roll_nbr_1    uuid := 'dddddddd-0000-0000-0000-000000000007';
  roll_nbr_2    uuid := 'dddddddd-0000-0000-0000-000000000008';
  roll_neo_3    uuid := 'dddddddd-0000-0000-0000-000000000009';
  roll_neo_4    uuid := 'dddddddd-0000-0000-0000-000000000010';
  roll_epdm_3   uuid := 'dddddddd-0000-0000-0000-000000000011';
  roll_epdm_4   uuid := 'dddddddd-0000-0000-0000-000000000012';
  roll_sil_2    uuid := 'dddddddd-0000-0000-0000-000000000013';
  roll_sil_3    uuid := 'dddddddd-0000-0000-0000-000000000014';
  roll_viton_2  uuid := 'dddddddd-0000-0000-0000-000000000015';
  roll_nbr_3    uuid := 'dddddddd-0000-0000-0000-000000000016';
  roll_nbr_4    uuid := 'dddddddd-0000-0000-0000-000000000017';
  roll_hyp_1    uuid := 'dddddddd-0000-0000-0000-000000000018';
  roll_hyp_2    uuid := 'dddddddd-0000-0000-0000-000000000019';
  roll_poly_1   uuid := 'dddddddd-0000-0000-0000-000000000020';
  roll_poly_2   uuid := 'dddddddd-0000-0000-0000-000000000021';
  roll_butyl_1  uuid := 'dddddddd-0000-0000-0000-000000000022';

  -- Material–supplier link UUIDs
  ms_neo_prem   uuid := 'eeeeeeee-0000-0000-0000-000000000001';
  ms_neo_mid    uuid := 'eeeeeeee-0000-0000-0000-000000000002';
  ms_epdm_prem  uuid := 'eeeeeeee-0000-0000-0000-000000000003';
  ms_epdm_bud   uuid := 'eeeeeeee-0000-0000-0000-000000000004';
  ms_sil_spec   uuid := 'eeeeeeee-0000-0000-0000-000000000005';
  ms_viton_spec uuid := 'eeeeeeee-0000-0000-0000-000000000006';
  ms_nbr_mid    uuid := 'eeeeeeee-0000-0000-0000-000000000007';
  ms_hyp_gulf   uuid := 'eeeeeeee-0000-0000-0000-000000000008';
  ms_poly_pac   uuid := 'eeeeeeee-0000-0000-0000-000000000009';
  ms_butyl_gulf uuid := 'eeeeeeee-0000-0000-0000-000000000010';
  ms_neo_pac    uuid := 'eeeeeeee-0000-0000-0000-000000000011';
  ms_sil_gulf   uuid := 'eeeeeeee-0000-0000-0000-000000000012';

  -- Purchase order UUIDs
  po_1          uuid := 'ffffffff-0000-0000-0000-000000000001';
  po_2          uuid := 'ffffffff-0000-0000-0000-000000000002';
  po_3          uuid := 'ffffffff-0000-0000-0000-000000000003';
  po_4          uuid := 'ffffffff-0000-0000-0000-000000000004';
  po_5          uuid := 'ffffffff-0000-0000-0000-000000000005';
  po_6          uuid := 'ffffffff-0000-0000-0000-000000000006';
  po_7          uuid := 'ffffffff-0000-0000-0000-000000000007';
  po_8          uuid := 'ffffffff-0000-0000-0000-000000000008';
  po_9          uuid := 'ffffffff-0000-0000-0000-000000000009';
  po_10         uuid := 'ffffffff-0000-0000-0000-000000000010';
  po_11         uuid := 'ffffffff-0000-0000-0000-000000000011';
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'dev-tenant';
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'seed.sql block 2: dev-tenant not found — block 1 must run first';
  END IF;

  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@rema.local';
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'seed.sql block 2: admin@rema.local not found — block 1 must run first';
  END IF;

  -- ── material_types ────────────────────────────────────────────────────────
  -- Dev `default_cost` (USD/sqft) and `min_stock_alert` (sqft) drop / convert:
  --   default_cost → omitted (lives on material_suppliers per redesign)
  --   min_stock_alert (sqft) → min_stock_sqm
  INSERT INTO public.material_types (id, tenant_id, name, description, min_stock_sqm, created_by, updated_by)
  VALUES
    (mt_neoprene, v_tenant_id, 'Neoprene',
     'General-purpose synthetic rubber. Excellent weather, oil, and flame resistance.',
     ROUND(500.0 / 10.7639, 3), v_admin_id, v_admin_id),
    (mt_epdm, v_tenant_id, 'EPDM',
     'Ethylene Propylene Diene Monomer. Superior UV and ozone resistance. Preferred for roofing.',
     ROUND(750.0 / 10.7639, 3), v_admin_id, v_admin_id),
    (mt_silicone, v_tenant_id, 'Silicone',
     'High-temperature synthetic rubber. Food-safe grades available.',
     ROUND(300.0 / 10.7639, 3), v_admin_id, v_admin_id),
    (mt_viton, v_tenant_id, 'Viton (FKM)',
     'Fluoroelastomer with outstanding chemical and heat resistance.',
     ROUND(200.0 / 10.7639, 3), v_admin_id, v_admin_id),
    (mt_nbr, v_tenant_id, 'Nitrile (NBR)',
     'Nitrile Butadiene Rubber. Excellent oil and fuel resistance.',
     ROUND(600.0 / 10.7639, 3), v_admin_id, v_admin_id),
    (mt_hypalon, v_tenant_id, 'Hypalon (CSM)',
     'Chlorosulfonated polyethylene. Superior chemical, acid, and UV resistance.',
     ROUND(250.0 / 10.7639, 3), v_admin_id, v_admin_id),
    (mt_poly, v_tenant_id, 'Polyurethane',
     'Abrasion-resistant elastomer with excellent tear strength.',
     ROUND(350.0 / 10.7639, 3), v_admin_id, v_admin_id),
    (mt_butyl, v_tenant_id, 'Butyl',
     'Isobutylene isoprene rubber. Exceptional gas impermeability.',
     ROUND(400.0 / 10.7639, 3), v_admin_id, v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- ── suppliers ─────────────────────────────────────────────────────────────
  -- Dev `address` (single text) → address_line1; dev `zip_code` → postal_code;
  -- dev `phone` → general_phone; dev `default_shipping_cost` USD →
  -- shipping_cost_cents; dev `contact_person` and `shipping_calculation_type`
  -- dropped (out of current schema).
  INSERT INTO public.suppliers (
    id, tenant_id, name, address_line1, city, state, postal_code, country,
    email, general_phone, website, payment_terms, rating, preferred, active,
    notes, tax_rate, tax_exempt, shipping_cost_cents, created_by, updated_by
  ) VALUES
    (sup_premium, v_tenant_id,
     'Premium Rubber Supply Co.', '1234 Industrial Blvd', 'Cleveland', 'OH', '44101', 'USA',
     'john.anderson@premiumrubber.com', '+1-800-555-0101', 'https://www.premiumrubber.com',
     'Net 30', 4.5, true, true,
     'Primary supplier. Consistent quality and reliable lead times.',
     0.0800, false, 7500, v_admin_id, v_admin_id),
    (sup_midwest, v_tenant_id,
     'Midwest Materials Inc.', '5678 Manufacturing Ave', 'Chicago', 'IL', '60601', 'USA',
     'sarah.chen@midwestmaterials.com', '+1-800-555-0102', 'https://www.midwestmaterials.com',
     '2/10 Net 30', 4.0, true, true,
     'Good pricing on EPDM and NBR. 2% discount if paid within 10 days.',
     0.1025, false, 5000, v_admin_id, v_admin_id),
    (sup_budget, v_tenant_id,
     'Budget Rubber Warehouse', '9012 Warehouse Way', 'Detroit', 'MI', '48201', 'USA',
     'mike@budgetrubber.com', '+1-800-555-0103', 'https://www.budgetrubber.com',
     'Net 45', 3.5, false, true,
     'Use for high-volume commodity orders only. Quality inconsistent on specialty grades.',
     0.0600, false, 3500, v_admin_id, v_admin_id),
    (sup_specialty, v_tenant_id,
     'Specialty Elastomers Ltd.', '3456 Research Parkway', 'Akron', 'OH', '44301', 'USA',
     'emily.watson@specialtyelastomers.com', '+1-800-555-0104', 'https://www.specialtyelastomers.com',
     'Net 30', 4.8, true, true,
     'Sole source for Viton and medical-grade silicone. Premium pricing.',
     0.0800, false, 10000, v_admin_id, v_admin_id),
    (sup_gulf, v_tenant_id,
     'Gulf Coast Rubber', '7890 Bayport Drive', 'Houston', 'TX', '77029', 'USA',
     'daniel.pham@gulfcoastrubber.com', '+1-800-555-0105', 'https://www.gulfcoastrubber.com',
     'Net 30', 4.2, false, true,
     'Strong on Hypalon and chemical-resistant stock. Faster lead times for Gulf region.',
     0.0825, false, 6000, v_admin_id, v_admin_id),
    (sup_pacific, v_tenant_id,
     'Pacific Seal Co.', '2020 Waterfront Ave', 'Seattle', 'WA', '98101', 'USA',
     'yuki.tanaka@pacificseal.com', '+1-800-555-0106', 'https://www.pacificseal.com',
     'Net 30', 4.6, true, true,
     'Polyurethane specialists. Import-grade stock with full traceability certs.',
     0.0650, false, 12000, v_admin_id, v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- ── material_suppliers ────────────────────────────────────────────────────
  INSERT INTO public.material_suppliers (
    id, tenant_id, material_type_id, supplier_id, supplier_material_code,
    cost_per_sqm_cents, minimum_order_sqm, lead_time_days,
    preferred_supplier, active, effective_date, created_by, updated_by
  ) VALUES
    (ms_neo_prem,   v_tenant_id, mt_neoprene, sup_premium,   'PRS-NEO-001', ROUND(12.50 * 10.7639 * 100), ROUND(500.0  / 10.7639, 3),  7, true,  true, CURRENT_DATE - INTERVAL '90 days', v_admin_id, v_admin_id),
    (ms_neo_mid,    v_tenant_id, mt_neoprene, sup_midwest,   'MMI-NEO-002', ROUND(11.75 * 10.7639 * 100), ROUND(750.0  / 10.7639, 3), 10, false, true, CURRENT_DATE - INTERVAL '60 days', v_admin_id, v_admin_id),
    (ms_epdm_prem,  v_tenant_id, mt_epdm,     sup_premium,   'PRS-EPD-001', ROUND( 8.75 * 10.7639 * 100), ROUND(750.0  / 10.7639, 3),  7, true,  true, CURRENT_DATE - INTERVAL '90 days', v_admin_id, v_admin_id),
    (ms_epdm_bud,   v_tenant_id, mt_epdm,     sup_budget,    'BRW-EPD-003', ROUND( 7.40 * 10.7639 * 100), ROUND(1000.0 / 10.7639, 3), 14, false, true, CURRENT_DATE - INTERVAL '30 days', v_admin_id, v_admin_id),
    (ms_sil_spec,   v_tenant_id, mt_silicone, sup_specialty, 'SEL-SIL-001', ROUND(15.25 * 10.7639 * 100), ROUND(300.0  / 10.7639, 3),  5, true,  true, CURRENT_DATE - INTERVAL '90 days', v_admin_id, v_admin_id),
    (ms_viton_spec, v_tenant_id, mt_viton,    sup_specialty, 'SEL-VIT-001', ROUND(28.50 * 10.7639 * 100), ROUND(200.0  / 10.7639, 3),  5, true,  true, CURRENT_DATE - INTERVAL '90 days', v_admin_id, v_admin_id),
    (ms_nbr_mid,    v_tenant_id, mt_nbr,      sup_midwest,   'MMI-NBR-003', ROUND( 9.25 * 10.7639 * 100), ROUND(500.0  / 10.7639, 3), 10, true,  true, CURRENT_DATE - INTERVAL '90 days', v_admin_id, v_admin_id),
    (ms_hyp_gulf,   v_tenant_id, mt_hypalon,  sup_gulf,      'GCR-HYP-001', ROUND(18.90 * 10.7639 * 100), ROUND(250.0  / 10.7639, 3),  9, true,  true, CURRENT_DATE - INTERVAL '60 days', v_admin_id, v_admin_id),
    (ms_poly_pac,   v_tenant_id, mt_poly,     sup_pacific,   'PSC-PU-001',  ROUND(21.40 * 10.7639 * 100), ROUND(200.0  / 10.7639, 3), 12, true,  true, CURRENT_DATE - INTERVAL '60 days', v_admin_id, v_admin_id),
    (ms_butyl_gulf, v_tenant_id, mt_butyl,    sup_gulf,      'GCR-BUT-001', ROUND(11.80 * 10.7639 * 100), ROUND(400.0  / 10.7639, 3),  9, true,  true, CURRENT_DATE - INTERVAL '60 days', v_admin_id, v_admin_id),
    (ms_neo_pac,    v_tenant_id, mt_neoprene, sup_pacific,   'PSC-NEO-002', ROUND(12.80 * 10.7639 * 100), ROUND(500.0  / 10.7639, 3), 12, false, true, CURRENT_DATE - INTERVAL '45 days', v_admin_id, v_admin_id),
    (ms_sil_gulf,   v_tenant_id, mt_silicone, sup_gulf,      'GCR-SIL-001', ROUND(16.20 * 10.7639 * 100), ROUND(300.0  / 10.7639, 3),  9, false, true, CURRENT_DATE - INTERVAL '45 days', v_admin_id, v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- ── price_history ─────────────────────────────────────────────────────────
  -- Guard on first-run only — no stable id and no unique constraint we can
  -- ON CONFLICT against.
  IF NOT EXISTS (SELECT 1 FROM public.price_history WHERE tenant_id = v_tenant_id) THEN
    INSERT INTO public.price_history (
      tenant_id, material_supplier_id,
      old_cost_per_sqm_cents, new_cost_per_sqm_cents,
      change_reason, effective_date, changed_by
    ) VALUES
      (v_tenant_id, ms_neo_prem,   ROUND(11.25 * 10.7639 * 100), ROUND(12.50 * 10.7639 * 100), 'Raw material cost increase (Q1 2024)',     CURRENT_DATE - INTERVAL '90 days',  v_admin_id),
      (v_tenant_id, ms_epdm_prem,  ROUND( 8.00 * 10.7639 * 100), ROUND( 8.75 * 10.7639 * 100), 'Supplier annual price adjustment',         CURRENT_DATE - INTERVAL '75 days',  v_admin_id),
      (v_tenant_id, ms_sil_spec,   ROUND(14.50 * 10.7639 * 100), ROUND(15.25 * 10.7639 * 100), 'Silicone feedstock shortage surcharge',    CURRENT_DATE - INTERVAL '60 days',  v_admin_id),
      (v_tenant_id, ms_nbr_mid,    ROUND( 8.75 * 10.7639 * 100), ROUND( 9.25 * 10.7639 * 100), 'Butadiene market price increase',          CURRENT_DATE - INTERVAL '14 days',  v_admin_id),
      (v_tenant_id, ms_viton_spec, ROUND(27.00 * 10.7639 * 100), ROUND(28.50 * 10.7639 * 100), 'Fluoroelastomer feedstock shortage',       CURRENT_DATE - INTERVAL '100 days', v_admin_id),
      (v_tenant_id, ms_epdm_bud,   ROUND( 7.80 * 10.7639 * 100), ROUND( 7.40 * 10.7639 * 100), 'Volume discount renegotiated',             CURRENT_DATE - INTERVAL '45 days',  v_admin_id),
      (v_tenant_id, ms_hyp_gulf,   ROUND(17.50 * 10.7639 * 100), ROUND(18.90 * 10.7639 * 100), 'Hypalon CSM tariff adjustment',            CURRENT_DATE - INTERVAL '40 days',  v_admin_id),
      (v_tenant_id, ms_poly_pac,   ROUND(20.50 * 10.7639 * 100), ROUND(21.40 * 10.7639 * 100), 'TDI feedstock price increase',             CURRENT_DATE - INTERVAL '35 days',  v_admin_id),
      (v_tenant_id, ms_butyl_gulf, ROUND(11.00 * 10.7639 * 100), ROUND(11.80 * 10.7639 * 100), 'Isobutylene supply contract renewal',      CURRENT_DATE - INTERVAL '28 days',  v_admin_id),
      (v_tenant_id, ms_sil_gulf,   ROUND(15.90 * 10.7639 * 100), ROUND(16.20 * 10.7639 * 100), 'Minor freight surcharge passthrough',      CURRENT_DATE - INTERVAL '7 days',   v_admin_id);
  END IF;

  -- ── reorder_rules ─────────────────────────────────────────────────────────
  INSERT INTO public.reorder_rules (
    tenant_id, material_type_id, supplier_id,
    reorder_point_sqm, reorder_quantity_sqm, max_stock_level_sqm,
    lead_time_days, safety_stock_days, auto_reorder, active,
    created_by, updated_by
  ) VALUES
    (v_tenant_id, mt_neoprene, sup_premium,   ROUND( 500.0 / 10.7639, 3), ROUND(1500.0 / 10.7639, 3), ROUND(3000.0 / 10.7639, 3),  7, 3, true,  true, v_admin_id, v_admin_id),
    (v_tenant_id, mt_epdm,     sup_premium,   ROUND( 750.0 / 10.7639, 3), ROUND(2000.0 / 10.7639, 3), ROUND(4000.0 / 10.7639, 3),  7, 3, true,  true, v_admin_id, v_admin_id),
    (v_tenant_id, mt_silicone, sup_specialty, ROUND( 300.0 / 10.7639, 3), ROUND( 900.0 / 10.7639, 3), ROUND(1800.0 / 10.7639, 3),  5, 2, false, true, v_admin_id, v_admin_id),
    (v_tenant_id, mt_viton,    sup_specialty, ROUND( 200.0 / 10.7639, 3), ROUND( 600.0 / 10.7639, 3), ROUND(1200.0 / 10.7639, 3),  5, 2, false, true, v_admin_id, v_admin_id),
    (v_tenant_id, mt_nbr,      sup_midwest,   ROUND( 600.0 / 10.7639, 3), ROUND(1500.0 / 10.7639, 3), ROUND(3000.0 / 10.7639, 3), 10, 4, true,  true, v_admin_id, v_admin_id),
    (v_tenant_id, mt_hypalon,  sup_gulf,      ROUND( 250.0 / 10.7639, 3), ROUND( 750.0 / 10.7639, 3), ROUND(1500.0 / 10.7639, 3),  9, 3, false, true, v_admin_id, v_admin_id),
    (v_tenant_id, mt_poly,     sup_pacific,   ROUND( 350.0 / 10.7639, 3), ROUND(1000.0 / 10.7639, 3), ROUND(2000.0 / 10.7639, 3), 12, 4, false, true, v_admin_id, v_admin_id),
    (v_tenant_id, mt_butyl,    sup_gulf,      ROUND( 400.0 / 10.7639, 3), ROUND(1200.0 / 10.7639, 3), ROUND(2400.0 / 10.7639, 3),  9, 3, true,  true, v_admin_id, v_admin_id)
  ON CONFLICT DO NOTHING;

  -- ── rolls ─────────────────────────────────────────────────────────────────
  -- Dev `supplier` (text name) → supplier_id (uuid FK).
  -- Inches/sqft → mm via inline ROUND. source_type = 'received' for all
  -- (offcuts are not seeded; they're created by cut_history).
  INSERT INTO public.rolls (
    id, tenant_id, material_type_id, supplier_id,
    width_mm, length_mm, remaining_length_mm, thickness_mm, color, location,
    date_received, cost_per_sqm_cents, status, notes,
    created_by, updated_by
  ) VALUES
    (roll_neo_1,   v_tenant_id, mt_neoprene, sup_premium,  ROUND(60 * 25.4)::int, ROUND(600 * 25.4)::int, ROUND(480 * 25.4)::int, ROUND(0.125 * 25.4, 3), 'Black',       'Rack A-1', CURRENT_DATE - INTERVAL '45 days',  ROUND(12.50 * 10.7639 * 100), 'active',   'Standard 1/8" sheet. High-volume stock.',                    v_admin_id, v_admin_id),
    (roll_neo_2,   v_tenant_id, mt_neoprene, sup_premium,  ROUND(48 * 25.4)::int, ROUND(300 * 25.4)::int, ROUND(300 * 25.4)::int, ROUND(0.250 * 25.4, 3), 'Black',       'Rack A-2', CURRENT_DATE - INTERVAL '20 days',  ROUND(14.75 * 10.7639 * 100), 'active',   '1/4" thick. Received full — no cuts yet.',                   v_admin_id, v_admin_id),
    (roll_epdm_1,  v_tenant_id, mt_epdm,     sup_midwest,  ROUND(72 * 25.4)::int, ROUND(720 * 25.4)::int, ROUND(540 * 25.4)::int, ROUND(0.063 * 25.4, 3), 'Black',       'Rack B-1', CURRENT_DATE - INTERVAL '60 days',  ROUND( 8.75 * 10.7639 * 100), 'active',   '1/16" roofing grade. Roughly 25% consumed.',                 v_admin_id, v_admin_id),
    (roll_epdm_2,  v_tenant_id, mt_epdm,     sup_budget,   ROUND(60 * 25.4)::int, ROUND(480 * 25.4)::int, ROUND(480 * 25.4)::int, ROUND(0.125 * 25.4, 3), 'Black',       'Rack B-2', CURRENT_DATE - INTERVAL '10 days',  ROUND( 7.90 * 10.7639 * 100), 'active',   'Budget grade. Monitor quality on first use.',                v_admin_id, v_admin_id),
    (roll_sil_1,   v_tenant_id, mt_silicone, sup_specialty,ROUND(36 * 25.4)::int, ROUND(240 * 25.4)::int, ROUND(180 * 25.4)::int, ROUND(0.125 * 25.4, 3), 'Red',         'Rack C-1', CURRENT_DATE - INTERVAL '30 days',  ROUND(15.25 * 10.7639 * 100), 'active',   'Red silicone. High-temp application stock.',                 v_admin_id, v_admin_id),
    (roll_viton_1, v_tenant_id, mt_viton,    sup_specialty,ROUND(24 * 25.4)::int, ROUND(120 * 25.4)::int, ROUND( 96 * 25.4)::int, ROUND(0.063 * 25.4, 3), 'Black',       'Rack D-1', CURRENT_DATE - INTERVAL '15 days',  ROUND(28.50 * 10.7639 * 100), 'active',   'FKM fluoroelastomer. Keep sealed until use.',                v_admin_id, v_admin_id),
    (roll_nbr_1,   v_tenant_id, mt_nbr,      sup_midwest,  ROUND(60 * 25.4)::int, ROUND(480 * 25.4)::int, ROUND(120 * 25.4)::int, ROUND(0.125 * 25.4, 3), 'Black',       'Rack E-1', CURRENT_DATE - INTERVAL '50 days',  ROUND( 9.25 * 10.7639 * 100), 'active',   'Running low — reorder triggered.',                           v_admin_id, v_admin_id),
    (roll_nbr_2,   v_tenant_id, mt_nbr,      sup_midwest,  ROUND(60 * 25.4)::int, ROUND(600 * 25.4)::int, ROUND(600 * 25.4)::int, ROUND(0.063 * 25.4, 3), 'Black',       'Rack E-2', CURRENT_DATE - INTERVAL '5 days',   ROUND( 9.00 * 10.7639 * 100), 'reserved', 'Reserved for Job #J-2024-0088.',                             v_admin_id, v_admin_id),
    (roll_neo_3,   v_tenant_id, mt_neoprene, sup_midwest,  ROUND(72 * 25.4)::int, ROUND(720 * 25.4)::int, ROUND(180 * 25.4)::int, ROUND(0.094 * 25.4, 3), 'Black',       'Rack A-3', CURRENT_DATE - INTERVAL '75 days',  ROUND(11.75 * 10.7639 * 100), 'active',   'Running low — below min_stock_alert. Reorder pending.',      v_admin_id, v_admin_id),
    (roll_neo_4,   v_tenant_id, mt_neoprene, sup_premium,  ROUND(36 * 25.4)::int, ROUND(480 * 25.4)::int, 0,                      ROUND(0.375 * 25.4, 3), 'Black',       'Rack A-4', CURRENT_DATE - INTERVAL '110 days', ROUND(16.80 * 10.7639 * 100), 'depleted', '3/8" thick. Depleted Q1 — awaiting archive.',                v_admin_id, v_admin_id),
    (roll_epdm_3,  v_tenant_id, mt_epdm,     sup_premium,  ROUND(60 * 25.4)::int, ROUND(480 * 25.4)::int, ROUND(360 * 25.4)::int, ROUND(0.188 * 25.4, 3), 'Black',       'Rack B-3', CURRENT_DATE - INTERVAL '35 days',  ROUND( 9.40 * 10.7639 * 100), 'active',   '3/16" compression-molded. Commercial grade.',                v_admin_id, v_admin_id),
    (roll_epdm_4,  v_tenant_id, mt_epdm,     sup_midwest,  ROUND(48 * 25.4)::int, ROUND(360 * 25.4)::int, ROUND(360 * 25.4)::int, ROUND(0.032 * 25.4, 3), 'Black',       'Rack B-4', CURRENT_DATE - INTERVAL '7 days',   ROUND( 7.20 * 10.7639 * 100), 'active',   '1/32" thin-gauge sheet. Arrived this week.',                 v_admin_id, v_admin_id),
    (roll_sil_2,   v_tenant_id, mt_silicone, sup_specialty,ROUND(48 * 25.4)::int, ROUND(300 * 25.4)::int, ROUND(210 * 25.4)::int, ROUND(0.094 * 25.4, 3), 'White',       'Rack C-2', CURRENT_DATE - INTERVAL '18 days',  ROUND(16.50 * 10.7639 * 100), 'active',   'FDA-grade white silicone. Food processing line.',            v_admin_id, v_admin_id),
    (roll_sil_3,   v_tenant_id, mt_silicone, sup_specialty,ROUND(36 * 25.4)::int, ROUND(180 * 25.4)::int, 0,                      ROUND(0.250 * 25.4, 3), 'Translucent', 'Rack C-3', CURRENT_DATE - INTERVAL '95 days',  ROUND(17.90 * 10.7639 * 100), 'depleted', 'Translucent high-temp. Depleted — replenish on next order.', v_admin_id, v_admin_id),
    (roll_viton_2, v_tenant_id, mt_viton,    sup_specialty,ROUND(36 * 25.4)::int, ROUND(180 * 25.4)::int, ROUND(140 * 25.4)::int, ROUND(0.125 * 25.4, 3), 'Brown',       'Rack D-2', CURRENT_DATE - INTERVAL '25 days',  ROUND(31.20 * 10.7639 * 100), 'active',   'Brown FKM — aerospace certification lot.',                   v_admin_id, v_admin_id),
    (roll_nbr_3,   v_tenant_id, mt_nbr,      sup_premium,  ROUND(72 * 25.4)::int, ROUND(720 * 25.4)::int, ROUND(450 * 25.4)::int, ROUND(0.032 * 25.4, 3), 'Black',       'Rack E-3', CURRENT_DATE - INTERVAL '85 days',  ROUND( 8.90 * 10.7639 * 100), 'active',   'Thin gauge for diaphragm fabrication.',                      v_admin_id, v_admin_id),
    (roll_nbr_4,   v_tenant_id, mt_nbr,      sup_budget,   ROUND(48 * 25.4)::int, ROUND(360 * 25.4)::int, 0,                      ROUND(0.250 * 25.4, 3), 'Black',       'Rack E-4', CURRENT_DATE - INTERVAL '65 days',  ROUND( 8.10 * 10.7639 * 100), 'depleted', 'Budget lot — depleted. Quality was acceptable but uneven.',  v_admin_id, v_admin_id),
    (roll_hyp_1,   v_tenant_id, mt_hypalon,  sup_gulf,     ROUND(48 * 25.4)::int, ROUND(240 * 25.4)::int, ROUND(180 * 25.4)::int, ROUND(0.063 * 25.4, 3), 'Gray',        'Rack F-1', CURRENT_DATE - INTERVAL '40 days',  ROUND(18.90 * 10.7639 * 100), 'active',   'Gray Hypalon — acid tank lining stock.',                     v_admin_id, v_admin_id),
    (roll_hyp_2,   v_tenant_id, mt_hypalon,  sup_gulf,     ROUND(36 * 25.4)::int, ROUND(180 * 25.4)::int, ROUND(180 * 25.4)::int, ROUND(0.125 * 25.4, 3), 'Black',       'Rack F-2', CURRENT_DATE - INTERVAL '12 days',  ROUND(19.40 * 10.7639 * 100), 'reserved', 'Reserved for Job #J-2024-0108 (chemical plant retrofit).',   v_admin_id, v_admin_id),
    (roll_poly_1,  v_tenant_id, mt_poly,     sup_pacific,  ROUND(60 * 25.4)::int, ROUND(300 * 25.4)::int, ROUND(120 * 25.4)::int, ROUND(0.188 * 25.4, 3), 'Amber',       'Rack G-1', CURRENT_DATE - INTERVAL '55 days',  ROUND(21.40 * 10.7639 * 100), 'active',   'Amber 80A durometer. Conveyor scraper stock.',               v_admin_id, v_admin_id),
    (roll_poly_2,  v_tenant_id, mt_poly,     sup_pacific,  ROUND(48 * 25.4)::int, ROUND(240 * 25.4)::int, ROUND(240 * 25.4)::int, ROUND(0.375 * 25.4, 3), 'Amber',       'Rack G-2', CURRENT_DATE - INTERVAL '22 days',  ROUND(23.80 * 10.7639 * 100), 'active',   '90A durometer — abrasion-resistant roller cover.',           v_admin_id, v_admin_id),
    (roll_butyl_1, v_tenant_id, mt_butyl,    sup_gulf,     ROUND(48 * 25.4)::int, ROUND(300 * 25.4)::int, ROUND(260 * 25.4)::int, ROUND(0.094 * 25.4, 3), 'Black',       'Rack H-1', CURRENT_DATE - INTERVAL '48 days',  ROUND(11.80 * 10.7639 * 100), 'active',   'Standard butyl sheet. Gas-impermeable vapor seal use.',      v_admin_id, v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- ── cuts ──────────────────────────────────────────────────────────────────
  -- Disable the auto-decrement trigger so seed-set remaining_length_mm on
  -- rolls stays at the pre-set values (trigger would otherwise double-debit).
  -- cuts.cut_by is left NULL — the named operators in the dev seed aren't
  -- real auth users; using NULL is more honest than mis-attributing.
  IF NOT EXISTS (SELECT 1 FROM public.cuts WHERE tenant_id = v_tenant_id) THEN
    ALTER TABLE public.cuts DISABLE TRIGGER trg_cuts_decrement_roll_and_notify;

    INSERT INTO public.cuts (
      tenant_id, roll_id,
      cut_width_mm, cut_length_mm, quantity,
      waste_sqmm, waste_percentage, total_sqmm_used,
      job_reference, notes, created_at, created_by
    ) VALUES
      (v_tenant_id, roll_neo_1,   ROUND(12 * 25.4)::int, ROUND(24 * 25.4)::int, 10, ROUND(0.83 * 92903.04)::bigint, 4.2, ROUND(20.83 * 92903.04)::bigint, 'J-2024-0071', 'Gaskets for hydraulic manifold assembly.',  NOW() - INTERVAL '40 days',  v_admin_id),
      (v_tenant_id, roll_neo_1,   ROUND(18 * 25.4)::int, ROUND(36 * 25.4)::int,  4, ROUND(0.50 * 92903.04)::bigint, 3.1, ROUND(16.50 * 92903.04)::bigint, 'J-2024-0074', 'Vibration damping pads.',                   NOW() - INTERVAL '35 days',  v_admin_id),
      (v_tenant_id, roll_neo_1,   ROUND( 6 * 25.4)::int, ROUND(12 * 25.4)::int, 20, ROUND(0.20 * 92903.04)::bigint, 2.0, ROUND(10.20 * 92903.04)::bigint, 'J-2024-0078', 'Small gaskets — pressure test fixture.',    NOW() - INTERVAL '28 days',  v_admin_id),
      (v_tenant_id, roll_epdm_1,  ROUND(24 * 25.4)::int, ROUND(48 * 25.4)::int,  6, ROUND(1.20 * 92903.04)::bigint, 5.0, ROUND(25.20 * 92903.04)::bigint, 'J-2024-0065', 'Outdoor weatherstrip seals.',               NOW() - INTERVAL '55 days',  v_admin_id),
      (v_tenant_id, roll_epdm_1,  ROUND(36 * 25.4)::int, ROUND(72 * 25.4)::int,  2, ROUND(0.90 * 92903.04)::bigint, 3.5, ROUND(26.90 * 92903.04)::bigint, 'J-2024-0069', 'Rooftop HVAC gaskets.',                     NOW() - INTERVAL '48 days',  v_admin_id),
      (v_tenant_id, roll_sil_1,   ROUND(12 * 25.4)::int, ROUND(12 * 25.4)::int,  8, ROUND(0.22 * 92903.04)::bigint, 2.3, ROUND( 9.89 * 92903.04)::bigint, 'J-2024-0080', 'High-temp oven door seals.',                NOW() - INTERVAL '22 days',  v_admin_id),
      (v_tenant_id, roll_sil_1,   ROUND(18 * 25.4)::int, ROUND(24 * 25.4)::int,  3, ROUND(0.38 * 92903.04)::bigint, 3.4, ROUND(11.63 * 92903.04)::bigint, 'J-2024-0082', 'Food-grade conveyor seals. QC checked.',    NOW() - INTERVAL '15 days',  v_admin_id),
      (v_tenant_id, roll_viton_1, ROUND( 6 * 25.4)::int, ROUND( 6 * 25.4)::int, 12, ROUND(0.18 * 92903.04)::bigint, 4.0, ROUND( 4.68 * 92903.04)::bigint, 'J-2024-0083', 'Chemical-resistant O-ring blanks.',         NOW() - INTERVAL '12 days',  v_admin_id),
      (v_tenant_id, roll_nbr_1,   ROUND(24 * 25.4)::int, ROUND(36 * 25.4)::int,  8, ROUND(1.60 * 92903.04)::bigint, 5.6, ROUND(30.27 * 92903.04)::bigint, 'J-2024-0075', 'Automotive valve stem seals.',              NOW() - INTERVAL '32 days',  v_admin_id),
      (v_tenant_id, roll_nbr_1,   ROUND(12 * 25.4)::int, ROUND(18 * 25.4)::int, 15, ROUND(0.75 * 92903.04)::bigint, 3.8, ROUND(20.58 * 92903.04)::bigint, 'J-2024-0079', 'Fuel system grommets.',                     NOW() - INTERVAL '25 days',  v_admin_id),
      (v_tenant_id, roll_neo_1,   ROUND(30 * 25.4)::int, ROUND(48 * 25.4)::int,  2, ROUND(0.42 * 92903.04)::bigint, 2.8, ROUND(15.42 * 92903.04)::bigint, 'J-2024-0085', 'Machine base anti-vibration mounts.',       NOW() - INTERVAL '7 days',   v_admin_id),
      (v_tenant_id, roll_epdm_2,  ROUND(48 * 25.4)::int, ROUND(60 * 25.4)::int,  1, ROUND(0.55 * 92903.04)::bigint, 2.3, ROUND(24.55 * 92903.04)::bigint, 'J-2024-0086', 'First cut from new roll — quality looks good.', NOW() - INTERVAL '3 days', v_admin_id),
      -- Historical cuts spread across ~180 days
      (v_tenant_id, roll_neo_3,   ROUND(24 * 25.4)::int, ROUND(36 * 25.4)::int,  5, ROUND(0.90 * 92903.04)::bigint, 4.1, ROUND(21.90 * 92903.04)::bigint, 'J-2024-0060', 'Pump housing gaskets.',                     NOW() - INTERVAL '170 days', v_admin_id),
      (v_tenant_id, roll_epdm_1,  ROUND(12 * 25.4)::int, ROUND(24 * 25.4)::int,  8, ROUND(0.48 * 92903.04)::bigint, 3.0, ROUND(16.48 * 92903.04)::bigint, 'J-2024-0061', 'Terminal box seals.',                       NOW() - INTERVAL '162 days', v_admin_id),
      (v_tenant_id, roll_nbr_3,   ROUND(18 * 25.4)::int, ROUND(30 * 25.4)::int,  4, ROUND(0.60 * 92903.04)::bigint, 4.8, ROUND(15.60 * 92903.04)::bigint, 'J-2024-0062', 'Fuel filter rings.',                        NOW() - INTERVAL '155 days', v_admin_id),
      (v_tenant_id, roll_neo_1,   ROUND(36 * 25.4)::int, ROUND(48 * 25.4)::int,  2, ROUND(0.75 * 92903.04)::bigint, 3.9, ROUND(24.75 * 92903.04)::bigint, 'J-2024-0063', 'Equipment base pads.',                      NOW() - INTERVAL '148 days', v_admin_id),
      (v_tenant_id, roll_epdm_3,  ROUND(24 * 25.4)::int, ROUND(36 * 25.4)::int,  6, ROUND(1.08 * 92903.04)::bigint, 5.0, ROUND(21.96 * 92903.04)::bigint, 'J-2024-0064', 'Weatherproof panel gaskets.',               NOW() - INTERVAL '140 days', v_admin_id),
      (v_tenant_id, roll_sil_2,   ROUND(12 * 25.4)::int, ROUND(18 * 25.4)::int, 10, ROUND(0.75 * 92903.04)::bigint, 3.3, ROUND(23.25 * 92903.04)::bigint, 'J-2024-0066', 'Food-line conveyor seals.',                 NOW() - INTERVAL '133 days', v_admin_id),
      (v_tenant_id, roll_neo_1,   ROUND(18 * 25.4)::int, ROUND(24 * 25.4)::int,  6, ROUND(0.72 * 92903.04)::bigint, 4.0, ROUND(17.28 * 92903.04)::bigint, 'J-2024-0067', 'Air compressor mounts.',                    NOW() - INTERVAL '125 days', v_admin_id),
      (v_tenant_id, roll_nbr_3,   ROUND(24 * 25.4)::int, ROUND(48 * 25.4)::int,  3, ROUND(0.90 * 92903.04)::bigint, 3.8, ROUND(23.70 * 92903.04)::bigint, 'J-2024-0068', 'Hydraulic reservoir gaskets.',              NOW() - INTERVAL '118 days', v_admin_id),
      (v_tenant_id, roll_hyp_1,   ROUND(24 * 25.4)::int, ROUND(36 * 25.4)::int,  2, ROUND(0.42 * 92903.04)::bigint, 3.5, ROUND(12.42 * 92903.04)::bigint, 'J-2024-0070', 'Chemical tank liner sample.',               NOW() - INTERVAL '108 days', v_admin_id),
      (v_tenant_id, roll_viton_2, ROUND(12 * 25.4)::int, ROUND(24 * 25.4)::int,  4, ROUND(0.32 * 92903.04)::bigint, 3.9, ROUND( 8.32 * 92903.04)::bigint, 'J-2024-0072', 'Solvent line flange seals.',                NOW() - INTERVAL '100 days', v_admin_id),
      (v_tenant_id, roll_poly_1,  ROUND(18 * 25.4)::int, ROUND(36 * 25.4)::int,  3, ROUND(0.54 * 92903.04)::bigint, 3.8, ROUND(14.04 * 92903.04)::bigint, 'J-2024-0073', 'Conveyor scraper blades.',                  NOW() - INTERVAL '92 days',  v_admin_id),
      (v_tenant_id, roll_butyl_1, ROUND(24 * 25.4)::int, ROUND(36 * 25.4)::int,  4, ROUND(0.72 * 92903.04)::bigint, 3.5, ROUND(24.72 * 92903.04)::bigint, 'J-2024-0076', 'Vapor barrier pads.',                       NOW() - INTERVAL '85 days',  v_admin_id),
      (v_tenant_id, roll_epdm_1,  ROUND(36 * 25.4)::int, ROUND(60 * 25.4)::int,  2, ROUND(1.05 * 92903.04)::bigint, 4.2, ROUND(30.45 * 92903.04)::bigint, 'J-2024-0077', 'Rooftop curb seals.',                       NOW() - INTERVAL '78 days',  v_admin_id),
      (v_tenant_id, roll_sil_1,   ROUND( 6 * 25.4)::int, ROUND(12 * 25.4)::int, 20, ROUND(0.25 * 92903.04)::bigint, 2.1, ROUND(10.25 * 92903.04)::bigint, 'J-2024-0081', 'Micro-gaskets for sensor housings.',        NOW() - INTERVAL '70 days',  v_admin_id),
      (v_tenant_id, roll_nbr_1,   ROUND(36 * 25.4)::int, ROUND(48 * 25.4)::int,  3, ROUND(1.20 * 92903.04)::bigint, 4.6, ROUND(37.20 * 92903.04)::bigint, 'J-2024-0084', 'Transmission pan gaskets.',                 NOW() - INTERVAL '62 days',  v_admin_id),
      (v_tenant_id, roll_poly_2,  ROUND(24 * 25.4)::int, ROUND(48 * 25.4)::int,  2, ROUND(0.48 * 92903.04)::bigint, 2.8, ROUND(16.48 * 92903.04)::bigint, 'J-2024-0087', 'Drum roller covers.',                       NOW() - INTERVAL '55 days',  v_admin_id),
      (v_tenant_id, roll_hyp_1,   ROUND(18 * 25.4)::int, ROUND(30 * 25.4)::int,  3, ROUND(0.45 * 92903.04)::bigint, 3.8, ROUND(11.70 * 92903.04)::bigint, 'J-2024-0089', 'Secondary containment sheet.',              NOW() - INTERVAL '50 days',  v_admin_id),
      (v_tenant_id, roll_neo_2,   ROUND(24 * 25.4)::int, ROUND(36 * 25.4)::int,  4, ROUND(0.72 * 92903.04)::bigint, 3.7, ROUND(24.72 * 92903.04)::bigint, 'J-2024-0090', '1/4" damper pads.',                         NOW() - INTERVAL '44 days',  v_admin_id),
      (v_tenant_id, roll_viton_1, ROUND( 8 * 25.4)::int, ROUND(12 * 25.4)::int,  6, ROUND(0.24 * 92903.04)::bigint, 4.1, ROUND( 4.74 * 92903.04)::bigint, 'J-2024-0091', 'O-ring blanks — chem processing.',          NOW() - INTERVAL '40 days',  v_admin_id),
      (v_tenant_id, roll_epdm_3,  ROUND(48 * 25.4)::int, ROUND(60 * 25.4)::int,  1, ROUND(0.65 * 92903.04)::bigint, 3.1, ROUND(20.65 * 92903.04)::bigint, 'J-2024-0092', 'Large flat gasket — reactor lid.',          NOW() - INTERVAL '37 days',  v_admin_id),
      (v_tenant_id, roll_sil_2,   ROUND(18 * 25.4)::int, ROUND(24 * 25.4)::int,  5, ROUND(0.60 * 92903.04)::bigint, 3.2, ROUND(15.60 * 92903.04)::bigint, 'J-2024-0093', 'Oven glass edge seals.',                    NOW() - INTERVAL '33 days',  v_admin_id),
      (v_tenant_id, roll_butyl_1, ROUND(12 * 25.4)::int, ROUND(18 * 25.4)::int, 10, ROUND(0.60 * 92903.04)::bigint, 3.6, ROUND(15.60 * 92903.04)::bigint, 'J-2024-0094', 'Duct vapor seals.',                         NOW() - INTERVAL '30 days',  v_admin_id),
      (v_tenant_id, roll_nbr_3,   ROUND(24 * 25.4)::int, ROUND(36 * 25.4)::int,  5, ROUND(1.35 * 92903.04)::bigint, 5.3, ROUND(25.35 * 92903.04)::bigint, 'J-2024-0095', 'Agricultural hose flanges.',                NOW() - INTERVAL '27 days',  v_admin_id),
      (v_tenant_id, roll_poly_1,  ROUND(24 * 25.4)::int, ROUND(36 * 25.4)::int,  2, ROUND(0.36 * 92903.04)::bigint, 2.5, ROUND(12.36 * 92903.04)::bigint, 'J-2024-0096', 'Wear pads for lift carriage.',              NOW() - INTERVAL '24 days',  v_admin_id),
      (v_tenant_id, roll_neo_3,   ROUND(12 * 25.4)::int, ROUND(18 * 25.4)::int, 12, ROUND(0.54 * 92903.04)::bigint, 3.0, ROUND(18.54 * 92903.04)::bigint, 'J-2024-0097', 'Compressor vibration mounts.',              NOW() - INTERVAL '21 days',  v_admin_id),
      (v_tenant_id, roll_epdm_4,  ROUND(36 * 25.4)::int, ROUND(48 * 25.4)::int,  2, ROUND(0.84 * 92903.04)::bigint, 3.9, ROUND(24.84 * 92903.04)::bigint, 'J-2024-0098', 'Thin HVAC flange seals.',                   NOW() - INTERVAL '19 days',  v_admin_id),
      (v_tenant_id, roll_hyp_1,   ROUND(36 * 25.4)::int, ROUND(48 * 25.4)::int,  1, ROUND(0.36 * 92903.04)::bigint, 2.9, ROUND(12.36 * 92903.04)::bigint, 'J-2024-0099', 'Chemical splash shield.',                   NOW() - INTERVAL '17 days',  v_admin_id),
      (v_tenant_id, roll_sil_1,   ROUND(24 * 25.4)::int, ROUND(24 * 25.4)::int,  4, ROUND(0.48 * 92903.04)::bigint, 3.0, ROUND(16.48 * 92903.04)::bigint, 'J-2024-0100', 'Heat-resistant door seals.',                NOW() - INTERVAL '14 days',  v_admin_id),
      (v_tenant_id, roll_viton_2, ROUND(12 * 25.4)::int, ROUND(18 * 25.4)::int,  6, ROUND(0.36 * 92903.04)::bigint, 4.0, ROUND( 9.36 * 92903.04)::bigint, 'J-2024-0101', 'Chemical reactor O-rings.',                 NOW() - INTERVAL '11 days',  v_admin_id),
      (v_tenant_id, roll_nbr_1,   ROUND(24 * 25.4)::int, ROUND(30 * 25.4)::int,  4, ROUND(0.80 * 92903.04)::bigint, 4.4, ROUND(20.80 * 92903.04)::bigint, 'J-2024-0102', 'Fuel injection gaskets.',                   NOW() - INTERVAL '10 days',  v_admin_id),
      (v_tenant_id, roll_poly_2,  ROUND(36 * 25.4)::int, ROUND(48 * 25.4)::int,  2, ROUND(0.72 * 92903.04)::bigint, 3.0, ROUND(24.72 * 92903.04)::bigint, 'J-2024-0103', 'Lift-gate scraper blades.',                 NOW() - INTERVAL '9 days',   v_admin_id),
      (v_tenant_id, roll_butyl_1, ROUND(18 * 25.4)::int, ROUND(24 * 25.4)::int,  6, ROUND(0.54 * 92903.04)::bigint, 3.8, ROUND(18.54 * 92903.04)::bigint, 'J-2024-0104', 'Vapor barrier membrane cuts.',              NOW() - INTERVAL '8 days',   v_admin_id),
      (v_tenant_id, roll_epdm_1,  ROUND(60 * 25.4)::int, ROUND(72 * 25.4)::int,  1, ROUND(1.20 * 92903.04)::bigint, 4.0, ROUND(31.20 * 92903.04)::bigint, 'J-2024-0105', 'Full-sheet roof patch.',                    NOW() - INTERVAL '6 days',   v_admin_id),
      (v_tenant_id, roll_neo_1,   ROUND(12 * 25.4)::int, ROUND(16 * 25.4)::int, 18, ROUND(0.48 * 92903.04)::bigint, 2.2, ROUND(22.48 * 92903.04)::bigint, 'J-2024-0106', 'Small vibration isolators.',                NOW() - INTERVAL '5 days',   v_admin_id),
      (v_tenant_id, roll_sil_2,   ROUND( 8 * 25.4)::int, ROUND(12 * 25.4)::int, 12, ROUND(0.30 * 92903.04)::bigint, 2.4, ROUND(10.30 * 92903.04)::bigint, 'J-2024-0107', 'Sensor probe seals.',                       NOW() - INTERVAL '4 days',   v_admin_id),
      (v_tenant_id, roll_hyp_1,   ROUND(24 * 25.4)::int, ROUND(48 * 25.4)::int,  1, ROUND(0.24 * 92903.04)::bigint, 1.8, ROUND(11.24 * 92903.04)::bigint, 'J-2024-0109', 'Tank patch — field repair.',                NOW() - INTERVAL '3 days',   v_admin_id),
      (v_tenant_id, roll_poly_1,  ROUND(18 * 25.4)::int, ROUND(24 * 25.4)::int,  4, ROUND(0.48 * 92903.04)::bigint, 3.3, ROUND(14.48 * 92903.04)::bigint, 'J-2024-0110', 'Idler roller covers.',                      NOW() - INTERVAL '2 days',   v_admin_id),
      (v_tenant_id, roll_epdm_3,  ROUND(18 * 25.4)::int, ROUND(24 * 25.4)::int,  6, ROUND(0.72 * 92903.04)::bigint, 3.4, ROUND(20.72 * 92903.04)::bigint, 'J-2024-0111', 'Door frame weatherstrip.',                  NOW() - INTERVAL '2 days',   v_admin_id),
      (v_tenant_id, roll_neo_2,   ROUND(30 * 25.4)::int, ROUND(36 * 25.4)::int,  2, ROUND(0.60 * 92903.04)::bigint, 3.2, ROUND(18.60 * 92903.04)::bigint, 'J-2024-0112', 'Machine base mounts.',                      NOW() - INTERVAL '1 days',   v_admin_id),
      (v_tenant_id, roll_butyl_1, ROUND(24 * 25.4)::int, ROUND(30 * 25.4)::int,  3, ROUND(0.60 * 92903.04)::bigint, 3.8, ROUND(15.60 * 92903.04)::bigint, 'J-2024-0113', 'Duct joint seals.',                         NOW() - INTERVAL '1 days',   v_admin_id),
      (v_tenant_id, roll_nbr_3,   ROUND(12 * 25.4)::int, ROUND(18 * 25.4)::int, 10, ROUND(0.54 * 92903.04)::bigint, 3.2, ROUND(15.54 * 92903.04)::bigint, 'J-2024-0114', 'Valve stem seals — latest batch.',          NOW() - INTERVAL '12 hours', v_admin_id),
      (v_tenant_id, roll_viton_2, ROUND( 6 * 25.4)::int, ROUND(12 * 25.4)::int,  8, ROUND(0.16 * 92903.04)::bigint, 3.2, ROUND( 4.16 * 92903.04)::bigint, 'J-2024-0115', 'Chemical dosing O-rings.',                  NOW() - INTERVAL '4 hours',  v_admin_id);

    ALTER TABLE public.cuts ENABLE TRIGGER trg_cuts_decrement_roll_and_notify;
  END IF;

  -- ── purchase_orders ───────────────────────────────────────────────────────
  -- Status mapping vs dev: 'pending' → 'pending_approval' (new schema's
  -- explicit pre-approval state); all other dev statuses pass through.
  INSERT INTO public.purchase_orders (
    id, tenant_id, supplier_id, po_number, status,
    order_date, requested_delivery_date, actual_delivery_date,
    subtotal_cents, tax_amount_cents, shipping_cost_cents, total_amount_cents,
    payment_terms, approved_by, approved_at, auto_generated, notes,
    created_by, updated_by
  ) VALUES
    (po_1, v_tenant_id, sup_premium, 'PO-2024-0001', 'received',
     CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '23 days', CURRENT_DATE - INTERVAL '22 days',
     250000, 20000, 7500, 277500,
     'Net 30', NULL, NULL, false, 'Routine neoprene restock. Received on time, quality verified.',
     v_admin_id, v_admin_id),
    (po_2, v_tenant_id, sup_midwest, 'PO-2024-0002', 'approved',
     CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '5 days', NULL,
     185000, 14800, 5000, 204800,
     '2/10 Net 30', v_admin_id, NOW() - INTERVAL '4 days', false, 'NBR restock triggered by low stock alert. Pay early for 2% discount.',
     v_admin_id, v_admin_id),
    (po_3, v_tenant_id, sup_specialty, 'PO-2024-0003', 'draft',
     NULL, NULL, NULL,
     427500, 34200, 0, 461700,
     'Net 30', NULL, NULL, true, 'Auto-generated by reorder rule for Viton and Silicone. Awaiting approval.',
     v_admin_id, v_admin_id),
    (po_4, v_tenant_id, sup_gulf, 'PO-2024-0004', 'received',
     CURRENT_DATE - INTERVAL '75 days', CURRENT_DATE - INTERVAL '66 days', CURRENT_DATE - INTERVAL '64 days',
     378000, 31185, 6000, 415185,
     'Net 30', v_admin_id, NOW() - INTERVAL '74 days', false, 'Initial Hypalon order — chemical plant contract. Received ahead of schedule.',
     v_admin_id, v_admin_id),
    (po_5, v_tenant_id, sup_pacific, 'PO-2024-0005', 'received',
     CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE - INTERVAL '48 days', CURRENT_DATE - INTERVAL '47 days',
     599200, 38948, 12000, 650148,
     'Net 30', v_admin_id, NOW() - INTERVAL '59 days', false, 'Polyurethane bulk order. QC inspection passed.',
     v_admin_id, v_admin_id),
    (po_6, v_tenant_id, sup_gulf, 'PO-2024-0006', 'ordered',
     CURRENT_DATE - INTERVAL '12 days', CURRENT_DATE + INTERVAL '2 days', NULL,
     283200, 23364, 6000, 312564,
     'Net 30', v_admin_id, NOW() - INTERVAL '11 days', true, 'Auto-reorder triggered — Butyl stock below threshold. Awaiting delivery.',
     v_admin_id, v_admin_id),
    (po_7, v_tenant_id, sup_budget, 'PO-2024-0007', 'pending_approval',
     CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '12 days', NULL,
     148000, 8880, 3500, 160380,
     'Net 45', NULL, NULL, false, 'EPDM commodity restock. Awaiting manager sign-off.',
     v_admin_id, v_admin_id),
    (po_8, v_tenant_id, sup_midwest, 'PO-2024-0008', 'approved',
     CURRENT_DATE - INTERVAL '1 days', CURRENT_DATE + INTERVAL '9 days', NULL,
     222000, 22755, 5000, 249755,
     '2/10 Net 30', v_admin_id, NOW() - INTERVAL '6 hours', false, 'NBR thin-gauge restock. Pay early to capture 2% discount.',
     v_admin_id, v_admin_id),
    (po_9, v_tenant_id, sup_specialty, 'PO-2024-0009', 'draft',
     NULL, NULL, NULL,
     364800, 29184, 0, 393984,
     'Net 30', NULL, NULL, false, 'Aerospace-grade Viton restock draft. Pending engineering spec review.',
     v_admin_id, v_admin_id),
    (po_10, v_tenant_id, sup_premium, 'PO-2024-0010', 'cancelled',
     CURRENT_DATE - INTERVAL '40 days', CURRENT_DATE - INTERVAL '30 days', NULL,
     95000, 7600, 7500, 110100,
     'Net 30', NULL, NULL, false, 'Cancelled — scope absorbed into PO-2024-0005 to consolidate shipping.',
     v_admin_id, v_admin_id),
    (po_11, v_tenant_id, sup_pacific, 'PO-2024-0011', 'ordered',
     CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE + INTERVAL '6 days', NULL,
     428000, 27820, 12000, 467820,
     'Net 30', v_admin_id, NOW() - INTERVAL '5 days', false, 'Polyurethane Q2 replenishment. Shipment tracked.',
     v_admin_id, v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- ── purchase_order_items ──────────────────────────────────────────────────
  -- Dev quantity_sqft → quantity_sqm; unit_cost USD/sqft → unit_cost_cents
  -- per sqm; line_total USD → cents; widths/lengths/thickness inches → mm.
  INSERT INTO public.purchase_order_items (
    tenant_id, purchase_order_id, material_type_id, line_number, description,
    width_mm, length_mm, thickness_mm,
    quantity_sqm, quantity_received_sqm, unit_cost_cents, line_total_cents,
    received_date, created_by, updated_by
  ) VALUES
    -- PO-2024-0001 (received)
    (v_tenant_id, po_1, mt_neoprene, 1, 'Neoprene 1/8" Black 60" wide',
     ROUND(60 * 25.4)::int, ROUND(400 * 25.4)::int, ROUND(0.125 * 25.4, 3),
     ROUND(200.0 / 10.7639, 3), ROUND(200.0 / 10.7639, 3),
     ROUND(12.50 * 10.7639 * 100), ROUND(2500.00 * 100),
     CURRENT_DATE - INTERVAL '22 days', v_admin_id, v_admin_id),

    -- PO-2024-0002 (approved, in transit)
    (v_tenant_id, po_2, mt_nbr, 1, 'Nitrile NBR 1/8" Black 60" wide',
     ROUND(60 * 25.4)::int, ROUND(400 * 25.4)::int, ROUND(0.125 * 25.4, 3),
     ROUND(200.0 / 10.7639, 3), 0,
     ROUND(9.25 * 10.7639 * 100), ROUND(1850.00 * 100),
     NULL, v_admin_id, v_admin_id),

    -- PO-2024-0003 (draft) — 2 lines
    (v_tenant_id, po_3, mt_viton, 1, 'Viton FKM 1/16" Black 24" wide',
     ROUND(24 * 25.4)::int, ROUND(100 * 25.4)::int, ROUND(0.063 * 25.4, 3),
     ROUND(75.0 / 10.7639, 3), 0,
     ROUND(28.50 * 10.7639 * 100), ROUND(2137.50 * 100),
     NULL, v_admin_id, v_admin_id),
    (v_tenant_id, po_3, mt_silicone, 2, 'Silicone Red 1/8" 36" wide',
     ROUND(36 * 25.4)::int, ROUND(200 * 25.4)::int, ROUND(0.125 * 25.4, 3),
     ROUND(137.5 / 10.7639, 3), 0,
     ROUND(15.25 * 10.7639 * 100), ROUND(2096.88 * 100),
     NULL, v_admin_id, v_admin_id),

    -- PO-2024-0004 (received, Hypalon) — 2 lines
    (v_tenant_id, po_4, mt_hypalon, 1, 'Hypalon CSM 1/16" Gray 48" wide',
     ROUND(48 * 25.4)::int, ROUND(240 * 25.4)::int, ROUND(0.063 * 25.4, 3),
     ROUND(120.0 / 10.7639, 3), ROUND(120.0 / 10.7639, 3),
     ROUND(18.90 * 10.7639 * 100), ROUND(2268.00 * 100),
     CURRENT_DATE - INTERVAL '64 days', v_admin_id, v_admin_id),
    (v_tenant_id, po_4, mt_hypalon, 2, 'Hypalon CSM 1/8" Black 36" wide',
     ROUND(36 * 25.4)::int, ROUND(180 * 25.4)::int, ROUND(0.125 * 25.4, 3),
     ROUND(80.0 / 10.7639, 3), ROUND(80.0 / 10.7639, 3),
     ROUND(18.90 * 10.7639 * 100), ROUND(1512.00 * 100),
     CURRENT_DATE - INTERVAL '64 days', v_admin_id, v_admin_id),

    -- PO-2024-0005 (received, Polyurethane) — 2 lines
    (v_tenant_id, po_5, mt_poly, 1, 'Polyurethane 3/16" Amber 60" wide',
     ROUND(60 * 25.4)::int, ROUND(300 * 25.4)::int, ROUND(0.188 * 25.4, 3),
     ROUND(150.0 / 10.7639, 3), ROUND(150.0 / 10.7639, 3),
     ROUND(21.40 * 10.7639 * 100), ROUND(3210.00 * 100),
     CURRENT_DATE - INTERVAL '47 days', v_admin_id, v_admin_id),
    (v_tenant_id, po_5, mt_poly, 2, 'Polyurethane 3/8" Amber 48" wide',
     ROUND(48 * 25.4)::int, ROUND(240 * 25.4)::int, ROUND(0.375 * 25.4, 3),
     ROUND(117.0 / 10.7639, 3), ROUND(117.0 / 10.7639, 3),
     ROUND(23.78 * 10.7639 * 100), ROUND(2782.26 * 100),
     CURRENT_DATE - INTERVAL '47 days', v_admin_id, v_admin_id),

    -- PO-2024-0006 (ordered, Butyl auto-reorder)
    (v_tenant_id, po_6, mt_butyl, 1, 'Butyl 3/32" Black 48" wide',
     ROUND(48 * 25.4)::int, ROUND(300 * 25.4)::int, ROUND(0.094 * 25.4, 3),
     ROUND(240.0 / 10.7639, 3), 0,
     ROUND(11.80 * 10.7639 * 100), ROUND(2832.00 * 100),
     NULL, v_admin_id, v_admin_id),

    -- PO-2024-0007 (pending_approval, EPDM commodity)
    (v_tenant_id, po_7, mt_epdm, 1, 'EPDM 1/8" Black 60" wide (budget)',
     ROUND(60 * 25.4)::int, ROUND(480 * 25.4)::int, ROUND(0.125 * 25.4, 3),
     ROUND(200.0 / 10.7639, 3), 0,
     ROUND(7.40 * 10.7639 * 100), ROUND(1480.00 * 100),
     NULL, v_admin_id, v_admin_id),

    -- PO-2024-0008 (approved, NBR thin-gauge)
    (v_tenant_id, po_8, mt_nbr, 1, 'Nitrile NBR 1/32" Black 72" wide',
     ROUND(72 * 25.4)::int, ROUND(720 * 25.4)::int, ROUND(0.032 * 25.4, 3),
     ROUND(240.0 / 10.7639, 3), 0,
     ROUND(9.25 * 10.7639 * 100), ROUND(2220.00 * 100),
     NULL, v_admin_id, v_admin_id),

    -- PO-2024-0009 (draft, aerospace Viton)
    (v_tenant_id, po_9, mt_viton, 1, 'Viton FKM 1/8" Brown 36" wide (aerospace)',
     ROUND(36 * 25.4)::int, ROUND(180 * 25.4)::int, ROUND(0.125 * 25.4, 3),
     ROUND(120.0 / 10.7639, 3), 0,
     ROUND(30.40 * 10.7639 * 100), ROUND(3648.00 * 100),
     NULL, v_admin_id, v_admin_id),

    -- PO-2024-0010 (cancelled, Neoprene)
    (v_tenant_id, po_10, mt_neoprene, 1, 'Neoprene 1/8" Black 60" wide (cancelled scope)',
     ROUND(60 * 25.4)::int, ROUND(240 * 25.4)::int, ROUND(0.125 * 25.4, 3),
     ROUND(100.0 / 10.7639, 3), 0,
     ROUND(9.50 * 10.7639 * 100), ROUND(950.00 * 100),
     NULL, v_admin_id, v_admin_id),

    -- PO-2024-0011 (ordered, Polyurethane Q2)
    (v_tenant_id, po_11, mt_poly, 1, 'Polyurethane 3/16" Amber 60" wide',
     ROUND(60 * 25.4)::int, ROUND(400 * 25.4)::int, ROUND(0.188 * 25.4, 3),
     ROUND(200.0 / 10.7639, 3), 0,
     ROUND(21.40 * 10.7639 * 100), ROUND(4280.00 * 100),
     NULL, v_admin_id, v_admin_id)
  ON CONFLICT (purchase_order_id, line_number) DO NOTHING;

  RAISE NOTICE 'Operational data seeded for Dev Tenant: 8 material types, 6 suppliers, 22 rolls, ~50 cuts, 12 material_suppliers, 10 price_history rows, 8 reorder_rules, 11 POs, 14 PO items.';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Final summary
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Dev seed complete.';
  RAISE NOTICE 'Tenant: Dev Tenant (slug: dev-tenant)';
  RAISE NOTICE 'Password (all six users): changeme123';
  RAISE NOTICE 'Login at http://localhost:3000/login as one of:';
  RAISE NOTICE '  admin@rema.local       (admin)';
  RAISE NOTICE '  manager@rema.local     (manager)';
  RAISE NOTICE '  supervisor@rema.local  (supervisor)';
  RAISE NOTICE '  cutter@rema.local      (cutter)';
  RAISE NOTICE '  member@rema.local      (member)';
  RAISE NOTICE '  viewer@rema.local      (viewer)';
END $$;
