-- Create profiles table for user role management
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name   VARCHAR(200),
  email       VARCHAR(255),
  role        VARCHAR(20) NOT NULL DEFAULT 'viewer',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_role  CHECK (role IN ('admin', 'cutter', 'viewer')),
  CONSTRAINT valid_email CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$')
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_role  ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY profiles_select_own
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY profiles_update_own
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY profiles_admin_select_all
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY profiles_admin_update_all
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Auto-create a profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    'viewer'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Reuse existing update_updated_at() from
-- 20240217000006_create_functions_and_triggers.sql
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Backfill profiles for any existing auth users (safe — skips duplicates)
INSERT INTO profiles (id, full_name, email, role)
SELECT
  u.id,
  u.raw_user_meta_data ->> 'full_name',
  u.email,
  'viewer'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = u.id
);

-- Add table and column comments
COMMENT ON TABLE profiles IS 'User profile and role data linked to auth.users';
COMMENT ON COLUMN profiles.id IS 'References auth.users(id) — one profile per user';
COMMENT ON COLUMN profiles.full_name IS 'Display name of the user';
COMMENT ON COLUMN profiles.email IS 'User email address';
COMMENT ON COLUMN profiles.role IS 'Access role: admin, cutter, or viewer';
COMMENT ON COLUMN profiles.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN profiles.updated_at IS 'Timestamp when record was last updated';

-- ─────────────────────────────────────────────────────────────────────────────
-- After running, promote your account to admin:
--   UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
--
-- To grant a worker cutter access:
--   UPDATE profiles SET role = 'cutter' WHERE email = 'worker@company.com';
-- ─────────────────────────────────────────────────────────────────────────────