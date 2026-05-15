-- Migration: 20260514000002_create_user_preferences.sql
-- Per-user preferences — locale + display defaults that the operator
-- controls for themselves, regardless of org-admin status.
--
-- Same shape as organization_preferences (which the previous migration
-- created), but the row is keyed by `user_id` and RLS lets the owner
-- SELECT/UPDATE their own row only. No admin gate. Any operator can
-- switch their own language to Spanish without an admin's involvement.
--
-- organization_preferences stays in the schema as a parking lot for a
-- future "workspace defaults" admin surface, but reads/writes in the
-- app now flow through user_preferences. New users get auto-provisioned
-- with the same defaults (USD / America/Chicago / MM/dd/yyyy / imperial
-- / 50 sqft / en-US).
--
-- Trigger fires AFTER INSERT on profiles (the canonical "user exists in
-- the app" event — auth.users has trigger noise we don't want to
-- depend on) and runs SECURITY DEFINER so it bypasses RLS at insert.

-- ─────────────────────────────────────────────────────────────
-- user_preferences — one row per profile
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id                   UUID PRIMARY KEY
                            REFERENCES auth.users(id) ON DELETE CASCADE,

  default_currency          CHAR(3)        NOT NULL DEFAULT 'USD'
                            CHECK (default_currency IN ('USD', 'EUR', 'GBP', 'CAD')),

  time_zone                 TEXT           NOT NULL DEFAULT 'America/Chicago'
                            CHECK (time_zone IN (
                              'America/Chicago',
                              'America/New_York',
                              'America/Los_Angeles',
                              'America/Denver',
                              'America/Phoenix',
                              'Europe/London',
                              'Europe/Paris',
                              'Asia/Tokyo'
                            )),

  date_format               TEXT           NOT NULL DEFAULT 'MM/dd/yyyy'
                            CHECK (date_format IN ('MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd')),

  unit_system               TEXT           NOT NULL DEFAULT 'imperial'
                            CHECK (unit_system IN ('imperial', 'metric')),

  low_stock_threshold_sqft  NUMERIC(10, 2) NOT NULL DEFAULT 50
                            CHECK (low_stock_threshold_sqft >= 0
                              AND low_stock_threshold_sqft <= 1000000),

  locale                    TEXT           NOT NULL DEFAULT 'en-US'
                            CHECK (locale IN ('en-US', 'es-MX')),

  created_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  user_preferences                          IS 'Per-user regional + operational defaults. Any operator can change their own row without admin involvement.';
COMMENT ON COLUMN user_preferences.locale                   IS 'UI language for this user. Independent of any org-level setting — a Spanish-speaking operator in an English workspace controls this for themselves.';

CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Auto-provision a row when a profile is created
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION provision_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION provision_user_preferences()
  IS 'Trigger function: auto-create the matching user_preferences row when a profile is inserted. SECURITY DEFINER so it bypasses RLS even when the profile is created by an end-user signup flow.';

CREATE TRIGGER profiles_provision_user_preferences
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION provision_user_preferences();

-- Backfill: every existing profile gets a default row.
INSERT INTO user_preferences (user_id)
SELECT id FROM profiles
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- RLS — users read + write their own row, nothing else
-- ─────────────────────────────────────────────────────────────

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_preferences_select_own
  ON user_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY user_preferences_update_own
  ON user_preferences FOR UPDATE
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- INSERT + DELETE intentionally have no end-user policy. Rows are
-- created by the trigger; deletion happens via ON DELETE CASCADE.
