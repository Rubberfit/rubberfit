-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260322050232_update_profiles_multi_role.sql
-- Converts single role column to roles TEXT[] array
-- Adds super_admin boolean flag for unrestricted platform access
-- ─────────────────────────────────────────────────────────────────────────────

--  1. Drop old RLS policies first (they reference the role column) 
DROP POLICY IF EXISTS profiles_select_own       ON profiles;
DROP POLICY IF EXISTS profiles_update_own       ON profiles;
DROP POLICY IF EXISTS profiles_admin_select_all ON profiles;
DROP POLICY IF EXISTS profiles_admin_update_all ON profiles;

-- Also drop any older named policies from the original migration
DROP POLICY IF EXISTS "Users can read own profile"            ON profiles;
DROP POLICY IF EXISTS "Users can update own profile (except role)" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles"          ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile"         ON profiles;
DROP POLICY IF EXISTS "profiles: users read own"              ON profiles;
DROP POLICY IF EXISTS "profiles: users update own (no role change)" ON profiles;
DROP POLICY IF EXISTS "profiles: admins read all"             ON profiles;
DROP POLICY IF EXISTS "profiles: admins update all"           ON profiles;


-- 2. Now safe to drop the old single-role constraint and column 
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE profiles DROP COLUMN IF EXISTS role;


-- 3. Add new roles array column
ALTER TABLE profiles
  ADD COLUMN roles TEXT[] NOT NULL DEFAULT ARRAY['member']::TEXT[];


-- 4. Constraint — every value must be a valid role
ALTER TABLE profiles
  ADD CONSTRAINT valid_roles CHECK (
    roles <@ ARRAY['admin','cutter','manager','member','supervisor','viewer']::TEXT[]
    AND array_length(roles, 1) > 0
  );


-- 5. GIN index for fast array lookups
CREATE INDEX IF NOT EXISTS idx_profiles_roles ON profiles USING GIN (roles);


-- 5a. Add super_admin flag
-- Distinct from the 'admin' role: super_admin bypasses all RLS policies and
-- has unrestricted access to every schema including admin.*
-- Only set manually by a DBA — never via the application UI.
ALTER TABLE profiles
  ADD COLUMN super_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_super_admin ON profiles (super_admin)
  WHERE super_admin = TRUE;                   -- partial index: only indexes the rare TRUE rows


-- 6. Helper functions

-- Returns TRUE if the user holds ANY of the given roles OR is a super_admin.
-- super_admin implicitly satisfies every role check.
CREATE OR REPLACE FUNCTION has_any_role(
  p_user_id UUID,
  p_roles    TEXT[]
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = p_user_id
      AND (roles && p_roles OR super_admin = TRUE)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_catalog;

-- Returns TRUE when the calling user's super_admin flag is set.
-- Use this to gate access to admin.* tables and unrestricted operations.
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND super_admin = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_catalog;


-- 7. Recreate RLS policies using the new roles array column
CREATE POLICY profiles_select_own
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY profiles_update_own
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- prevent self-escalation: regular users cannot flip their own super_admin flag
    AND super_admin = (SELECT super_admin FROM profiles WHERE id = auth.uid())
    AND roles = (SELECT roles FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY profiles_admin_select_all
  ON profiles FOR SELECT
  USING (has_any_role(auth.uid(), ARRAY['admin','manager']));

-- Admins can update other profiles but cannot grant super_admin — only a super_admin can do that
CREATE POLICY profiles_admin_update_all
  ON profiles FOR UPDATE
  USING (has_any_role(auth.uid(), ARRAY['admin']))
  WITH CHECK (
    -- non-super_admins cannot elevate any profile to super_admin
    (super_admin = FALSE OR is_super_admin())
  );

-- super_admin has unrestricted read/write on all profiles
CREATE POLICY profiles_super_admin_all
  ON profiles FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- 8. Update handle_new_user — new signups start as ['member'], super_admin=FALSE
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, roles, super_admin)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    ARRAY['member']::TEXT[],
    FALSE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 9. Backfill existing rows 
UPDATE profiles
SET roles = ARRAY['member']::TEXT[]
WHERE roles IS NULL OR array_length(roles, 1) IS NULL;


-- 10. Column and function comments
COMMENT ON COLUMN profiles.roles IS
  'Array of roles: admin, cutter, manager, member, supervisor, viewer. Users can hold multiple roles simultaneously.';

COMMENT ON COLUMN profiles.super_admin IS
  'When TRUE the user bypasses all RLS policies and has unrestricted access to every schema including admin.*. Set manually by a DBA only — never exposed in the application UI.';

COMMENT ON FUNCTION has_any_role(UUID, TEXT[]) IS
  'Returns true if user has ANY of the given roles, OR is a super_admin (which implicitly satisfies every role check). Uses && array overlap operator.';

COMMENT ON FUNCTION is_super_admin() IS
  'Returns true when the calling user''s super_admin flag is TRUE. Use to gate admin.* schema access and unrestricted operations.';


-- ─────────────────────────────────────────────────────────────────────────────
-- ROLE → ACTION PERMISSION MATRIX
--
-- Action                 | super_admin | admin | manager | supervisor | cutter | member | viewer
-- -----------------------|-------------|-------|---------|------------|--------|--------|-------
-- Access cut planner     |      ✓      |   ✓   |         |            |   ✓    |        |
-- Create / confirm cuts  |      ✓      |   ✓   |         |            |   ✓    |        |
-- Manage rolls           |      ✓      |   ✓   |    ✓    |            |        |        |
-- Manage users & roles   |      ✓      |   ✓   |         |            |        |        |
-- View inventory         |      ✓      |   ✓   |    ✓    |     ✓      |   ✓    |   ✓    |   ✓
-- View reports           |      ✓      |   ✓   |    ✓    |     ✓      |        |        |
-- Access admin portal    |      ✓      |   ✓   |         |            |        |        |
-- Grant super_admin      |      ✓      |       |         |            |        |        |
-- Bypass all RLS         |      ✓      |       |         |            |        |        |
--
-- super_admin is a separate boolean flag, not a value in the roles array.
-- It implicitly satisfies every role check via has_any_role().
-- ─────────────────────────────────────────────────────────────────────────────


-- ── ROLE ASSIGNMENT EXAMPLES (run manually after migration) ───────────────────

-- Promote yourself to admin:
-- UPDATE profiles SET roles = ARRAY['admin'] WHERE email = 'your@email.com';

-- Give a worker cutter + supervisor:
-- UPDATE profiles SET roles = ARRAY['cutter','supervisor'] WHERE email = 'worker@company.com';

-- Add a single role without removing existing ones:
-- UPDATE profiles SET roles = array_append(roles, 'supervisor') WHERE email = 'worker@company.com';

-- Remove a single role:
-- UPDATE profiles SET roles = array_remove(roles, 'cutter') WHERE email = 'worker@company.com';

-- Grant super_admin (DBA only — never via the app):
-- UPDATE profiles SET super_admin = TRUE WHERE email = 'platform-owner@company.com';

-- Revoke super_admin:
-- UPDATE profiles SET super_admin = FALSE WHERE email = 'platform-owner@company.com';
