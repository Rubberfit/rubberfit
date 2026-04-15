-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260414000001_add_user_management_fields.sql
-- Adds soft-delete and last-sign-in tracking to the profiles table.
-- ─────────────────────────────────────────────────────────────────────────────


-- 1. Add is_deleted (soft-delete flag)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- 2. Add last_sign_in_at (synced from auth.users via trigger below)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_is_deleted    ON profiles(is_deleted);
CREATE INDEX IF NOT EXISTS idx_profiles_last_sign_in  ON profiles(last_sign_in_at DESC NULLS LAST);


-- 4. Trigger: keep profiles.last_sign_in_at in sync with auth.users
CREATE OR REPLACE FUNCTION sync_last_sign_in_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    UPDATE profiles
    SET last_sign_in_at = NEW.last_sign_in_at
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop first so re-running the migration is idempotent
DROP TRIGGER IF EXISTS on_auth_user_sign_in ON auth.users;

CREATE TRIGGER on_auth_user_sign_in
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_last_sign_in_to_profile();


-- 5. RLS: allow admins to INSERT profiles
--    (needed when creating a user via the admin API and the trigger hasn't fired yet,
--     or when back-filling profiles for existing auth users)
DROP POLICY IF EXISTS profiles_admin_insert ON profiles;

CREATE POLICY profiles_admin_insert
  ON profiles FOR INSERT
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin']));


-- 6. Column comments
COMMENT ON COLUMN profiles.is_deleted IS
  'Soft-delete flag. When true the user is deactivated and loses all access.';

COMMENT ON COLUMN profiles.last_sign_in_at IS
  'Mirrors auth.users.last_sign_in_at, kept in sync via the on_auth_user_sign_in trigger.';
