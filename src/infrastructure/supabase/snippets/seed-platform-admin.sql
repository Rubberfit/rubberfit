-- =============================================================
-- seed-platform-admin.sql — idempotent local seed for a platform admin
--
-- Credentials:
--   email:    platform-admin@rema.dev
--   password: Password123!
--
-- Creates:
--   1. auth.users row + auth.identities row (email/password login)
--   2. profiles row with is_platform_admin = true
--   3. A host tenant (Platform Admin Tenant) + tenant_settings
--   4. Admin-role membership linking the user to that tenant
--
-- Safe to re-run — every INSERT is ON CONFLICT DO NOTHING / DO UPDATE.
-- Run from a local psql or paste into Supabase Studio's SQL editor
-- AFTER `npm run supabase:reset` has applied migrations 1–10.
-- =============================================================

-- ─── 1. auth.users ────────────────────────────────────────────
INSERT INTO auth.users (
  instance_id,
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at, updated_at,
  aud, role,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-0000-0000-0000-000000000001',
  'platform-admin@rema.dev',
  crypt('Password123!', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Platform Admin"}'::jsonb,
  NOW(), NOW(),
  'authenticated', 'authenticated',
  '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. auth.identities — required for email/password login ───
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
WHERE u.id = 'ffffffff-0000-0000-0000-000000000001'
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ─── 3. profiles — is_platform_admin = true ───────────────────
-- (No handle_new_user trigger in the redesigned migrations, so the
--  profile row is inserted manually.)
INSERT INTO profiles (id, first_name, last_name, email, is_platform_admin)
VALUES (
  'ffffffff-0000-0000-0000-000000000001',
  'Platform',
  'Admin',
  'platform-admin@rema.dev',
  true
)
ON CONFLICT (id) DO UPDATE
  SET is_platform_admin = true,
      email             = EXCLUDED.email;

-- ─── 4. Host tenant + settings ────────────────────────────────
-- Platform admins bypass tenant RLS, but the UI still needs a
-- current-tenant context to write tenant-scoped rows.
INSERT INTO tenants (id, name, slug)
VALUES (
  'ffffffff-0000-0000-0000-000000000002',
  'Platform Admin Tenant',
  'platform-admin-tenant'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant_settings (tenant_id)
VALUES ('ffffffff-0000-0000-0000-000000000002')
ON CONFLICT (tenant_id) DO NOTHING;

-- ─── 5. Admin-role membership ─────────────────────────────────
INSERT INTO memberships (tenant_id, profile_id, roles)
VALUES (
  'ffffffff-0000-0000-0000-000000000002',
  'ffffffff-0000-0000-0000-000000000001',
  ARRAY['admin']::text[]
)
ON CONFLICT (tenant_id, profile_id) DO NOTHING;
