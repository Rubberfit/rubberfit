-- ═══════════════════════════════════════════════════════════════════════════
-- REDESIGN — File 1 of 9: Core schema
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables: plans, tenants, tenant_settings, subscriptions, profiles,
--         memberships, user_preferences, addresses, persons
--
-- Design decisions:
--   • Multitenancy: tenant_id on every data table, membership via memberships
--   • Roles: TEXT[] array on memberships (per-tenant) + is_platform_admin flag
--   • Money: bigint cents (no direct plan_id on tenants — via subscriptions)
--   • 1:1 relations use shared PK (tenant_settings.tenant_id = tenants.id)
--   • Notification prefs: jsonb on user_preferences (no separate table)
--
-- RLS, indexes, and triggers live in later files (7, 8, 9).
-- Requires a fresh local Supabase stack — legacy migrations must be cleared
-- before applying this set.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── plans ─────────────────────────────────────────────────────────────────
-- Global reference data: subscription tiers. No tenant_id.

CREATE TABLE plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                varchar(50) NOT NULL UNIQUE,
  name                varchar(200) NOT NULL,
  description         text,
  price_cents         bigint NOT NULL CHECK (price_cents >= 0),
  currency            char(3) NOT NULL DEFAULT 'USD',
  billing_interval    varchar(20) NOT NULL
                      CHECK (billing_interval IN ('month', 'year')),
  stripe_price_id     varchar(255),
  seat_limit          integer CHECK (seat_limit IS NULL OR seat_limit > 0),
  is_active           boolean NOT NULL DEFAULT true,
  is_public           boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  features            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT plans_code_valid CHECK (code IN ('standard', 'pro', 'max'))
);

COMMENT ON TABLE plans IS
  'Global subscription plans. Read-only for regular users; writable by platform admins.';


-- ─── tenants ───────────────────────────────────────────────────────────────
-- Organizations/workspaces. One auth.users can belong to many tenants via
-- memberships. Plan assignment is via subscriptions (not a direct FK here).

CREATE TABLE tenants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                varchar(200) NOT NULL,
  slug                varchar(100) NOT NULL UNIQUE,
  logo_url            varchar(500),
  status              varchar(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'suspended', 'trial', 'cancelled')),
  trial_ends_at       timestamptz,
  billing_email       varchar(320),
  stripe_customer_id  varchar(255),
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$')
);

COMMENT ON TABLE tenants IS 'Organizations/workspaces. Tenant isolation unit.';
COMMENT ON COLUMN tenants.slug IS 'URL-safe tenant identifier (lowercase, dashes).';


-- ─── tenant_settings ───────────────────────────────────────────────────────
-- 1:1 with tenants via shared PK. Settings that apply org-wide.

CREATE TABLE tenant_settings (
  tenant_id           uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  default_currency    char(3) NOT NULL DEFAULT 'USD',
  unit_system         varchar(10) NOT NULL DEFAULT 'metric'
                      CHECK (unit_system IN ('metric', 'imperial')),
  date_format         varchar(20) NOT NULL DEFAULT 'MM/DD/YYYY',
  timezone            varchar(50) NOT NULL DEFAULT 'America/New_York',
  inventory_settings  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE tenant_settings IS
  'Tenant-wide preferences. Shared PK with tenants for 1:1 relationship.';
COMMENT ON COLUMN tenant_settings.unit_system IS
  'Display/input unit system for this tenant. Storage remains metric (mm / sqm / cents) regardless; the app converts at the UI edge. Users can override via user_preferences.ui_preferences.unit_system.';


-- ─── subscriptions ─────────────────────────────────────────────────────────
-- Tracks active subscription of a tenant to a plan. Source of truth for
-- "what plan does this tenant have right now".

CREATE TABLE subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id                 uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  stripe_subscription_id  varchar(255),
  status                  varchar(20) NOT NULL
                          CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete')),
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at               timestamptz,
  canceled_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at              timestamptz
);

-- One active subscription per tenant; archived rows (deleted_at/canceled) can coexist.
CREATE UNIQUE INDEX subscriptions_one_active_per_tenant
  ON subscriptions(tenant_id)
  WHERE status IN ('trialing', 'active', 'past_due') AND deleted_at IS NULL;


-- ─── profiles ──────────────────────────────────────────────────────────────
-- One row per auth.users. Platform-level metadata. Roles are per-tenant and
-- live on memberships; platform-admin status is on profiles because it's
-- cross-tenant.

CREATE TABLE profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name          varchar(100),
  last_name           varchar(100),
  full_name           varchar(200) GENERATED ALWAYS AS (
                        NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '')
                      ) STORED,
  email               varchar(320),
  is_platform_admin   boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT profiles_email_format
    CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

COMMENT ON COLUMN profiles.is_platform_admin IS
  'Cross-tenant super-admin flag. RLS bypasses tenant checks when true.';
COMMENT ON COLUMN profiles.full_name IS
  'Computed from first_name and last_name (stored generated column).';


-- ─── memberships ───────────────────────────────────────────────────────────
-- User's access to a tenant. Many-to-many between profiles and tenants.
-- Roles are an array to support users holding multiple roles in one tenant
-- (e.g., ['cutter', 'supervisor']).

CREATE TABLE memberships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  roles               text[] NOT NULL DEFAULT ARRAY['member']::text[],
  invited_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT memberships_unique_active UNIQUE (tenant_id, profile_id),
  CONSTRAINT memberships_roles_valid CHECK (
    roles <@ ARRAY['admin', 'manager', 'supervisor', 'cutter', 'member', 'viewer']::text[]
    AND array_length(roles, 1) > 0
  )
);

COMMENT ON TABLE memberships IS
  'Per-tenant user access + roles. One user → many tenants.';


-- ─── user_preferences ──────────────────────────────────────────────────────
-- 1:1 with profiles via shared PK. Holds notification prefs (as JSON) and
-- UI prefs (as JSON). No separate notification_preferences table.

CREATE TABLE user_preferences (
  profile_id                uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  notification_preferences  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ui_preferences            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON COLUMN user_preferences.notification_preferences IS
  'Per-type toggles, quiet hours, timezone, channel settings, thresholds. '
  'Schema lives in src/types/notifications.ts.';


-- ─── addresses ─────────────────────────────────────────────────────────────
-- Tenant-scoped lookup. Referenced by suppliers, purchase_orders (billing/shipping).

CREATE TABLE addresses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  address_line1       varchar(200) NOT NULL,
  address_line2       varchar(200),
  city                varchar(100) NOT NULL,
  state               varchar(100) NOT NULL,
  postal_code         varchar(20) NOT NULL,
  country             varchar(100) NOT NULL DEFAULT 'United States',
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz
);


-- ─── persons ───────────────────────────────────────────────────────────────
-- Tenant-scoped people records. Used for supplier contacts, job contacts,
-- invoice bill-to, etc. NOT the same as profiles — a person is external
-- (no auth account) unless linked via profile_id.

CREATE TABLE persons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  first_name          varchar(100) NOT NULL,
  last_name           varchar(100) NOT NULL,
  email               varchar(320),
  phone               varchar(30),
  mobile              varchar(30),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,

  CONSTRAINT persons_has_contact CHECK (
    email IS NOT NULL OR phone IS NOT NULL OR mobile IS NOT NULL
  ),
  CONSTRAINT persons_email_format
    CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

COMMENT ON TABLE persons IS
  'External contacts (supplier reps, customers). Optionally linked to a profile '
  'via profile_id when the person also has platform access.';
