-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20240225000001_update_profiles_multi_role.sql
-- Converts single role column to roles TEXT[] array
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


-- 6. Helper function — ANY role match 
CREATE OR REPLACE FUNCTION has_any_role(
  p_user_id UUID,
  p_roles    TEXT[]
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = p_user_id
      AND roles && p_roles
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- 7. Recreate RLS policies using the new roles array column 
CREATE POLICY profiles_select_own
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY profiles_update_own
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND roles = (SELECT roles FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY profiles_admin_select_all
  ON profiles FOR SELECT
  USING (has_any_role(auth.uid(), ARRAY['admin','manager']));

CREATE POLICY profiles_admin_update_all
  ON profiles FOR UPDATE
  USING (has_any_role(auth.uid(), ARRAY['admin']));


-- 8. Update handle_new_user — new signups start as ['member'] 
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, roles)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    ARRAY['member']::TEXT[]
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 9. Backfill existing rows 
UPDATE profiles
SET roles = ARRAY['member']::TEXT[]
WHERE roles IS NULL OR array_length(roles, 1) IS NULL;


-- 10. Column comments 
COMMENT ON COLUMN profiles.roles IS
  'Array of roles: admin, cutter, manager, member, supervisor, viewer. Users can hold multiple roles simultaneously.';

COMMENT ON FUNCTION has_any_role(UUID, TEXT[]) IS
  'Returns true if user has ANY of the given roles. Uses && array overlap operator.';


-- ─────────────────────────────────────────────────────────────────────────────
-- ROLE → ACTION PERMISSION MATRIX
--
-- Action                 | admin | manager | supervisor | cutter | member | viewer
-- -----------------------|-------|---------|------------|--------|--------|-------
-- Access cut planner     |   ✓   |    ✓    |     ✓      |   ✓    |        |
-- Create / confirm cuts  |   ✓   |         |            |   ✓    |        |
-- Manage rolls           |   ✓   |    ✓    |            |        |        |
-- Manage users & roles   |   ✓   |         |            |        |        |
-- View inventory         |   ✓   |    ✓    |     ✓      |   ✓    |   ✓    |   ✓
-- View reports           |   ✓   |    ✓    |     ✓      |        |        |
--
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