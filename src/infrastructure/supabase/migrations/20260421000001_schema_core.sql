-- ═══════════════════════════════════════════════════════════════════════════
-- REDESIGN — File 1 of 9: Core schema
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables: plans, tenants, tenant_settings, subscriptions, profiles,
--         memberships, user_preferences, persons
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
  tenant_id                 uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  default_currency          char(3) NOT NULL DEFAULT 'USD',
  unit_system               varchar(10) NOT NULL DEFAULT 'metric'
                            CHECK (unit_system IN ('metric', 'imperial')),
  date_format               varchar(20) NOT NULL DEFAULT 'MM/DD/YYYY',
  timezone                  varchar(50) NOT NULL DEFAULT 'America/New_York',
  -- Workspace default low-stock alert threshold. Read at material_types
  -- creation time to seed material_types.min_stock_alert; per-material
  -- overrides still win. Imperial (sqft) for parity with operator-facing
  -- forms; the action layer converts when persisting metric columns.
  low_stock_threshold_sqft  numeric(10, 2) NOT NULL DEFAULT 50
                            CHECK (low_stock_threshold_sqft >= 0
                              AND low_stock_threshold_sqft <= 1000000),
  -- UI language default for the workspace. Per-user override lives on
  -- user_preferences.locale and wins for that user's sessions.
  locale                    text NOT NULL DEFAULT 'en-US'
                            CHECK (locale IN ('en-US', 'es-MX')),
  inventory_settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE tenant_settings IS
  'Tenant-wide preferences. Shared PK with tenants for 1:1 relationship.';
COMMENT ON COLUMN tenant_settings.unit_system IS
  'Display/input unit system for this tenant. Storage remains metric (mm / sqm / cents) regardless; the app converts at the UI edge. Users can override via user_preferences.ui_preferences.unit_system.';


-- ─── subscriptions ─────────────────────────────────────────────────────────
-- Tracks active subscription of a tenant to a plan. Source of truth for
-- "what plan does this tenant have right now". The Stripe webhook handler
-- upserts rows by stripe_subscription_id; older rows stay for audit, and
-- `is_current = TRUE` flags the row that governs current access (enforced
-- unique-per-tenant via a partial index below).

CREATE TABLE subscriptions (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id                       uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,

  -- Stripe identifiers
  stripe_subscription_id        varchar(255) UNIQUE,
  stripe_subscription_item_id   text,
  stripe_price_id               text,
  stripe_product_id             text,
  latest_invoice_id             text,

  -- Plan attributes mirrored from Stripe metadata for fast reads
  plan_tier                     varchar(20) NOT NULL DEFAULT 'standard'
                                CHECK (plan_tier IN ('standard', 'pro', 'max', 'enterprise')),
  billing_interval              varchar(10)
                                CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'annual')),
  seat_count                    integer NOT NULL DEFAULT 1 CHECK (seat_count >= 1),

  -- Lifecycle. Full Stripe subscription.status enum + the trial/cancel windows.
  status                        varchar(20) NOT NULL
                                CHECK (status IN (
                                  'incomplete', 'incomplete_expired',
                                  'trialing', 'active',
                                  'past_due', 'canceled', 'unpaid', 'paused'
                                )),
  trial_end                     timestamptz,
  current_period_start          timestamptz,
  current_period_end            timestamptz,
  cancel_at_period_end          boolean NOT NULL DEFAULT false,
  cancel_at                     timestamptz,
  canceled_at                   timestamptz,

  -- Payment state mirrored from invoice events
  last_payment_status           varchar(20),

  -- Webhook ordering trail
  last_stripe_event_id          text,
  last_stripe_event_created_at  timestamptz,

  -- Current-entitlement flag (enforced unique-per-tenant via the partial index)
  is_current                    boolean NOT NULL DEFAULT true,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  created_by                    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by                    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at                    timestamptz
);

-- One active subscription per tenant; archived rows (deleted_at/canceled) can coexist.
CREATE UNIQUE INDEX subscriptions_one_active_per_tenant
  ON subscriptions(tenant_id)
  WHERE status IN ('trialing', 'active', 'past_due') AND deleted_at IS NULL;

-- One current-entitlement row per tenant. The webhook keeps older rows around
-- with is_current = FALSE for audit; reads filter on this flag for the
-- billing UI's "what's my current plan" surface.
CREATE UNIQUE INDEX subscriptions_one_current_per_tenant
  ON subscriptions(tenant_id) WHERE is_current = true;

COMMENT ON COLUMN subscriptions.status IS
  'Mirrors Stripe subscription.status verbatim — gate logic matches on this string.';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS
  'TRUE after the user clicks Cancel; access stays until current_period_end fires customer.subscription.deleted.';
COMMENT ON COLUMN subscriptions.is_current IS
  'TRUE on the row that governs current access. Enforced unique-per-tenant via partial index.';


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
  last_active_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT profiles_email_format
    CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

COMMENT ON COLUMN profiles.is_platform_admin IS
  'Cross-tenant super-admin flag. RLS bypasses tenant checks when true.';
COMMENT ON COLUMN profiles.last_active_tenant_id IS
  'User-selected active tenant. Read by login callback + middleware to restore tenant context across sessions. Multi-tenant UX only; single-membership users never touch this.';
COMMENT ON COLUMN profiles.full_name IS
  'Computed from first_name and last_name (stored generated column).';


-- ─── memberships ───────────────────────────────────────────────────────────
-- User's access to a tenant. Many-to-many between profiles and tenants.
-- Roles are an array to support users holding multiple roles in one tenant
-- (e.g., ['cutter', 'supervisor']).
--
-- Seat-counting status lives alongside the soft-delete column: `status =
-- 'active'` consumes a seat for billing, `'deactivated'` frees the seat
-- immediately, `'removed'` is a soft-deleted audit row. `deleted_at` is
-- still the canonical "this row no longer matters" signal used by RLS;
-- `status` is the operator-facing lifecycle flag surfaced in the admin
-- members UI + Stripe seat math. The two coexist deliberately — RLS reads
-- `deleted_at`, billing reads `status`.

CREATE TABLE memberships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  roles               text[] NOT NULL DEFAULT ARRAY['member']::text[],
  status              varchar(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'deactivated', 'removed')),
  invited_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  joined_at           timestamptz NOT NULL DEFAULT now(),
  deactivated_at      timestamptz,
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
COMMENT ON COLUMN memberships.status IS
  'Seat-counting status. active = consumes a Stripe seat; deactivated = frees seat immediately but keeps the row; removed = soft-deleted audit row. RLS still reads deleted_at — status is the operator-facing lifecycle.';
COMMENT ON COLUMN memberships.deactivated_at IS
  'Timestamp the seat was freed via status → deactivated. Distinct from deleted_at (which signals the row is no longer participating in tenant context at all).';


-- ─── user_preferences ──────────────────────────────────────────────────────
-- 1:1 with profiles via shared PK. Holds notification prefs (as JSON) and
-- UI prefs (as JSON). No separate notification_preferences table.

CREATE TABLE user_preferences (
  profile_id                uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  notification_preferences  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ui_preferences            jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Per-user regional + operational defaults. Surfaced in /dashboard/settings.
  -- These flat columns are the active surface (app actions read/write them
  -- directly); the jsonb columns above hold the more open-ended bag of
  -- notification toggles + UI state. tenant_settings.* play the same role
  -- at the workspace level — the user's row wins when both are set.
  default_currency          char(3) NOT NULL DEFAULT 'USD'
                            CHECK (default_currency IN ('USD', 'EUR', 'GBP', 'CAD')),
  time_zone                 text NOT NULL DEFAULT 'America/Chicago'
                            CHECK (time_zone IN (
                              'America/Chicago', 'America/New_York',
                              'America/Los_Angeles', 'America/Denver',
                              'America/Phoenix',
                              'Europe/London', 'Europe/Paris',
                              'Asia/Tokyo'
                            )),
  date_format               text NOT NULL DEFAULT 'MM/dd/yyyy'
                            CHECK (date_format IN ('MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd')),
  unit_system               text NOT NULL DEFAULT 'imperial'
                            CHECK (unit_system IN ('imperial', 'metric')),
  low_stock_threshold_sqft  numeric(10, 2) NOT NULL DEFAULT 50
                            CHECK (low_stock_threshold_sqft >= 0
                              AND low_stock_threshold_sqft <= 1000000),
  locale                    text NOT NULL DEFAULT 'en-US'
                            CHECK (locale IN ('en-US', 'es-MX')),

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON COLUMN user_preferences.notification_preferences IS
  'Per-type toggles, quiet hours, timezone, channel settings, thresholds. '
  'Schema lives in src/types/notifications.ts.';
COMMENT ON COLUMN user_preferences.locale IS
  'Per-user UI language. Independent of tenant_settings.locale — a Spanish-speaking operator in an English workspace controls this for themselves.';


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


-- ─── stripe_events ─────────────────────────────────────────────────────────
-- Webhook idempotency dedupe. The Stripe webhook handler INSERTs into this
-- table FIRST (with status = 'pending') before doing any state-changing
-- work. ON CONFLICT (stripe_event_id) → handler returns 2xx without
-- re-processing. On success the row is updated to status='processed'; on
-- failure attempt_count is bumped so retries are observable.
--
-- Not tenant-scoped (Stripe events aren't tenant-bound at the webhook
-- layer; the handler resolves the tenant from the customer ID inside).
-- RLS is enabled with NO end-user policies = service-role writes only.

CREATE TABLE stripe_events (
  stripe_event_id      text PRIMARY KEY,
  type                 text NOT NULL,
  status               varchar(20) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'processed', 'error')),
  attempt_count        integer NOT NULL DEFAULT 0,
  error                text,
  event_created_at     timestamptz,
  received_at          timestamptz NOT NULL DEFAULT now(),
  processed_at         timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE stripe_events IS
  'Webhook idempotency dedupe. Insert with status=pending first, then update to processed/error. Service-role writes only — no end-user policies.';
COMMENT ON COLUMN stripe_events.event_created_at IS
  'Stripe''s event.created timestamp — used for ordering across delayed deliveries.';
COMMENT ON COLUMN stripe_events.attempt_count IS
  'Bumped on each processing attempt. Useful for triage of stuck rows.';
