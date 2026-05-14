-- Migration: 20260514000001_create_organization_preferences.sql
-- Rubberfit Settings persistence + i18n prototype.
--
-- One row per organization, holding the regional + operational defaults
-- that General Settings has been collecting in pure-client state since
-- Phase 2 PR 2 (2026-05-06). The columns are:
--
--   default_currency           — display currency (USD/EUR/GBP/CAD); no FX yet
--   time_zone                  — IANA timezone for display + report scheduling
--   date_format                — display pattern (MM/dd/yyyy etc.); ISO dates
--                                still used for filenames + CSV exports
--   unit_system                — imperial (default) or metric display
--   low_stock_threshold_sqft   — default low-stock alert level for new
--                                materials; per-material override still wins
--   locale                     — UI language for the workspace (en-US default,
--                                es-MX for the Mexico manufacturing market)
--
-- RLS: org members can SELECT; owners + admins can UPDATE. INSERT happens
-- automatically via a trigger when a new organization is created, so
-- there is no end-user INSERT/DELETE path (defense-in-depth).
--
-- Codex scoping doc: .claude/handoff/codex-result-settings-i18n-scope-2026-05-13.md
-- Resume memory: project_rubberfit_settings_i18n_scoping_2026-05-13

-- ─────────────────────────────────────────────────────────────
-- organization_preferences — one row per organization
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_preferences (
  organization_id           UUID PRIMARY KEY
                            REFERENCES organizations(id) ON DELETE CASCADE,

  default_currency          CHAR(3)        NOT NULL DEFAULT 'USD'
                            CHECK (default_currency IN ('USD', 'EUR', 'GBP', 'CAD')),

  -- IANA timezone (e.g. America/Chicago). DB-level allowlist mirrors
  -- the action's zod refinement so a hand-crafted PostgREST admin
  -- update can't poison the column with a string that crashes
  -- `Intl.DateTimeFormat(timeZone)` on render. The list intentionally
  -- matches the picker options in regional-section.tsx — extend both
  -- sides together when adding a new zone.
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

  -- Cap mirrors the server-action validator (`<= 1_000_000`); without
  -- it a direct PostgREST write could persist an absurd threshold that
  -- the UI happily renders but no operator could practically meet.
  low_stock_threshold_sqft  NUMERIC(10, 2) NOT NULL DEFAULT 50
                            CHECK (low_stock_threshold_sqft >= 0
                              AND low_stock_threshold_sqft <= 1000000),

  locale                    TEXT           NOT NULL DEFAULT 'en-US'
                            CHECK (locale IN ('en-US', 'es-MX')),

  created_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  organization_preferences                          IS 'Per-organization regional + operational defaults surfaced in /dashboard/settings/general. One row per org; auto-created on organizations INSERT.';
COMMENT ON COLUMN organization_preferences.default_currency         IS 'Display currency for the workspace. Display-only — no FX conversion in PR 1.';
COMMENT ON COLUMN organization_preferences.time_zone                IS 'IANA timezone (e.g. America/Chicago) applied to dashboard dates, PDF timestamps, and notification scheduling.';
COMMENT ON COLUMN organization_preferences.date_format              IS 'Display date pattern. ISO yyyy-MM-dd is still used for CSV/file exports regardless of this setting.';
COMMENT ON COLUMN organization_preferences.unit_system              IS 'Imperial or metric for ALL display surfaces (cutting engine canvas, PDFs, tables, emails). Canonical storage stays inches/sqft.';
COMMENT ON COLUMN organization_preferences.low_stock_threshold_sqft IS 'Default low-stock alert threshold in canonical sqft. Used when seeding new material_types.min_stock_alert; per-material override still wins downstream.';
COMMENT ON COLUMN organization_preferences.locale                   IS 'UI language for the workspace. en-US default; es-MX for the Mexico manufacturing market. Expands as new locales ship.';

CREATE TRIGGER organization_preferences_updated_at
  BEFORE UPDATE ON organization_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Auto-provision a preferences row when an organization is created
-- ─────────────────────────────────────────────────────────────
--
-- Keeps the invariant "every org has exactly one preferences row" without
-- requiring the onboarding action to know about this table. Runs as
-- SECURITY DEFINER because end-users do not have direct INSERT on this
-- table (RLS denies it); the trigger bypasses RLS as the owner role.

CREATE OR REPLACE FUNCTION provision_organization_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO organization_preferences (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION provision_organization_preferences()
  IS 'Trigger function: auto-create the matching organization_preferences row when an organization is inserted. SECURITY DEFINER so the trigger bypasses RLS even when the org is created by an end-user action.';

CREATE TRIGGER organizations_provision_preferences
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION provision_organization_preferences();

-- Backfill existing organizations created before this migration ran.
INSERT INTO organization_preferences (organization_id)
SELECT id FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- RLS — members read, admins write
-- ─────────────────────────────────────────────────────────────

ALTER TABLE organization_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_preferences_select_member
  ON organization_preferences FOR SELECT
  USING (is_organization_member(organization_id));

CREATE POLICY organization_preferences_update_admin
  ON organization_preferences FOR UPDATE
  USING      (is_organization_admin(organization_id))
  WITH CHECK (is_organization_admin(organization_id));

-- INSERT + DELETE intentionally have no end-user policy. The trigger
-- creates rows on org creation; deletion only happens via ON DELETE
-- CASCADE when an organization is dropped. Hand-crafted PostgREST
-- INSERT/DELETE calls fail closed.
