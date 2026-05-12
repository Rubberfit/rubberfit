-- Migration: 20260512000001_create_organizations_billing.sql
-- Rubberfit Stripe Phase 1 — organization billing schema.
--
-- Five new tables sit alongside the existing `profiles` model:
--
--   organizations             — tenant identity (one per paying customer)
--   organization_members      — membership + role + status
--   organization_subscriptions — Stripe subscription history with is_current
--   organization_invitations  — invite tokens with 7-day expiry
--   stripe_events             — webhook idempotency dedupe (service-role only)
--
-- For v1 the relationship is strictly one user → one org (enforced by
-- UNIQUE on organization_members.user_id). Multi-org membership is a
-- post-launch follow-up.
--
-- Existing tenant tables (rolls, cuts, purchase_orders, etc.) do NOT
-- get organization_id in this migration — that backfill ships separately
-- after the billing schema is exercised end-to-end.
--
-- Subscription lifecycle includes Stripe's cancel-at-period-end semantics
-- (cancel_at_period_end, cancel_at, canceled_at) per Stripe docs:
--   https://docs.stripe.com/billing/subscriptions/canceling
--
-- RLS uses two SECURITY DEFINER helpers (is_organization_member,
-- is_organization_admin) so policies stay readable and don't recurse on
-- their own tables. Webhook + onboarding writes are expected to run as
-- service-role (bypassing RLS); end-user reads go through the helpers.

-- ─────────────────────────────────────────────────────────────
-- organizations — one row per paying tenant
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name                VARCHAR(200) NOT NULL,
  billing_email       VARCHAR(255),
  stripe_customer_id  TEXT UNIQUE,

  -- The auth.users row that created the org. Stays as the owner unless
  -- ownership transfer is implemented later. NOT auth.uid() in the
  -- column default — the create flow runs server-side with an explicit
  -- actor, and webhook flows have no auth.uid() context.
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organizations_valid_billing_email
    CHECK (billing_email IS NULL OR billing_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
  ON organizations(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_created_by
  ON organizations(created_by) WHERE created_by IS NOT NULL;

COMMENT ON TABLE  organizations                      IS 'Tenant identity. One row per paying customer (Stripe Customer 1:1).';
COMMENT ON COLUMN organizations.billing_email        IS 'Billing-only contact; separate from any individual member''s profile email. Stripe receipts route here.';
COMMENT ON COLUMN organizations.stripe_customer_id   IS 'Lazy-attached on first Checkout success. NULL until the webhook persists session.customer.';
COMMENT ON COLUMN organizations.created_by           IS 'The auth.users row that originally created the org. ON DELETE SET NULL — losing the creator does not orphan the org.';

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- organization_members — membership + role + status
-- ─────────────────────────────────────────────────────────────
--
-- For v1 a user belongs to at most ONE org — enforced via UNIQUE
-- (user_id). When multi-org lands later, drop the UNIQUE and add
-- a "current_organization_id" pointer on profiles instead.

CREATE TABLE IF NOT EXISTS organization_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Billing/tenant role, separate from in-app RBAC (profiles.role).
  --   owner   — the org creator; cannot be deactivated without transfer
  --   admin   — manages billing, invites, members
  --   member  — read/write inside the app per profiles.role; no billing
  role                VARCHAR(20) NOT NULL DEFAULT 'member'
                      CHECK (role IN ('owner', 'admin', 'member')),

  -- Seat-counting status. Pending invites count toward the cap via
  -- organization_invitations.status='pending'; member rows here count
  -- when status='active'. 'deactivated' immediately frees a seat;
  -- 'removed' is a soft delete kept for audit.
  status              VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'deactivated', 'removed')),

  invited_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at      TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- v1: one user → one org. Lift this UNIQUE when multi-org ships.
  CONSTRAINT organization_members_one_org_per_user UNIQUE (user_id),

  -- Defensive: don't allow duplicate active membership rows even if
  -- the per-user UNIQUE is lifted in the future.
  CONSTRAINT organization_members_unique_active_pair
    UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_org
  ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user
  ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_active_org
  ON organization_members(organization_id, status)
  WHERE status = 'active';

COMMENT ON TABLE  organization_members            IS 'Org membership + billing role + activation status. Separate from profiles.role (in-app RBAC).';
COMMENT ON COLUMN organization_members.role       IS 'Billing/tenant authority: owner, admin, or member. Distinct from profiles.role which gates in-app permissions.';
COMMENT ON COLUMN organization_members.status     IS 'Seat-counting status. active = consumes a seat; deactivated = seat freed immediately; removed = soft-deleted, kept for audit.';

CREATE TRIGGER organization_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER helpers — RLS uses these to avoid recursion
-- and keep policies one-liner readable.
-- ─────────────────────────────────────────────────────────────
--
-- Both helpers run with the function owner's privileges (typically
-- postgres) so they can read organization_members without recursing
-- into that table's own RLS policies. SET search_path = public
-- prevents schema-shadowing attacks. STABLE lets Postgres cache
-- results inside a single statement.

CREATE OR REPLACE FUNCTION is_organization_member(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_organization_admin(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION is_organization_member(UUID)
  IS 'True if auth.uid() is an active member of the given org. SECURITY DEFINER avoids recursive RLS on organization_members.';
COMMENT ON FUNCTION is_organization_admin(UUID)
  IS 'True if auth.uid() is an active owner or admin of the given org. SECURITY DEFINER avoids recursive RLS on organization_members.';

-- ─────────────────────────────────────────────────────────────
-- RLS for organizations + organization_members
-- ─────────────────────────────────────────────────────────────

ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- organizations: members see their org; admins update it; creation
-- happens via service-role onboarding action (no RLS-only insert path).
CREATE POLICY organizations_select_member
  ON organizations FOR SELECT
  USING (is_organization_member(id));

CREATE POLICY organizations_update_admin
  ON organizations FOR UPDATE
  USING      (is_organization_admin(id))
  WITH CHECK (is_organization_admin(id));

-- DELETE intentionally has no policy — orgs are not user-deletable.

-- organization_members: members see the roster; admins manage rows;
-- a user can update their own row to leave (status → 'deactivated').
CREATE POLICY organization_members_select
  ON organization_members FOR SELECT
  USING (is_organization_member(organization_id));

CREATE POLICY organization_members_admin_insert
  ON organization_members FOR INSERT
  WITH CHECK (is_organization_admin(organization_id));

CREATE POLICY organization_members_admin_update
  ON organization_members FOR UPDATE
  USING      (is_organization_admin(organization_id))
  WITH CHECK (is_organization_admin(organization_id));

-- Self-leave is intentionally NOT a row-level policy. RLS UPDATE cannot
-- reference OLD.* in WITH CHECK, so a self-update policy can't safely
-- restrict the set of columns a user may touch on their own row —
-- writing `status='deactivated'` would also allow flipping
-- organization_id, role, and invited_by while passing the check. PR 4
-- routes voluntary leave through a service-role server action that
-- validates the actor owns the row and writes only the status fields.
-- This matches the "billing writes are server-only" stance on
-- organization_subscriptions and organization_invitations.

CREATE POLICY organization_members_admin_delete
  ON organization_members FOR DELETE
  USING (is_organization_admin(organization_id));

-- ─────────────────────────────────────────────────────────────
-- organization_subscriptions — Stripe subscription history
-- ─────────────────────────────────────────────────────────────
--
-- Webhook handler upserts rows by stripe_subscription_id. The current
-- entitlement for an org is the row with is_current = TRUE; the
-- partial UNIQUE index enforces "at most one current row per org."
-- Older subscription rows stay for audit.

CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id               UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Stripe identifiers
  stripe_subscription_id        TEXT UNIQUE,
  stripe_subscription_item_id   TEXT,
  stripe_price_id               TEXT,
  stripe_product_id             TEXT,
  latest_invoice_id             TEXT,

  -- Plan attributes mirrored from Stripe metadata for fast reads
  plan_tier                     VARCHAR(20) NOT NULL DEFAULT 'standard'
                                CHECK (plan_tier IN ('standard', 'pro', 'max', 'enterprise')),
  billing_interval              VARCHAR(10)
                                CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'annual')),
  seat_count                    INTEGER NOT NULL DEFAULT 1
                                CHECK (seat_count >= 1),

  -- Stripe subscription.status — full enum so the gate logic can match
  -- canonical strings without remapping.
  status                        VARCHAR(20) NOT NULL DEFAULT 'incomplete'
                                CHECK (status IN (
                                  'incomplete', 'incomplete_expired',
                                  'trialing', 'active',
                                  'past_due', 'canceled', 'unpaid', 'paused'
                                )),

  -- Trial / period windows
  trial_end                     TIMESTAMPTZ,
  current_period_start          TIMESTAMPTZ,
  current_period_end            TIMESTAMPTZ,

  -- Cancellation lifecycle (period-end semantics)
  cancel_at_period_end          BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_at                     TIMESTAMPTZ,
  canceled_at                   TIMESTAMPTZ,

  -- Payment state (mirrored from invoice events)
  last_payment_status           VARCHAR(20),

  -- Webhook ordering trail
  last_stripe_event_id          TEXT,
  last_stripe_event_created_at  TIMESTAMPTZ,

  -- Current-entitlement flag. Enforced unique-per-org via the partial
  -- index below.
  is_current                    BOOLEAN NOT NULL DEFAULT TRUE,

  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_subscriptions_one_current
  ON organization_subscriptions(organization_id)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_org
  ON organization_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_stripe_sub
  ON organization_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_status
  ON organization_subscriptions(status);

COMMENT ON TABLE  organization_subscriptions                       IS 'Stripe subscription history with is_current=TRUE flagging the row that governs current access. Older rows stay for audit.';
COMMENT ON COLUMN organization_subscriptions.status                IS 'Mirrors Stripe subscription.status verbatim — gate logic matches on this string.';
COMMENT ON COLUMN organization_subscriptions.cancel_at_period_end  IS 'TRUE after the user clicks Cancel; access stays until current_period_end fires customer.subscription.deleted.';
COMMENT ON COLUMN organization_subscriptions.cancel_at             IS 'Stripe-computed timestamp of when the cancellation actually takes effect (= current_period_end at cancel time).';
COMMENT ON COLUMN organization_subscriptions.canceled_at           IS 'Set when customer.subscription.deleted fires. NULL until the period actually ends.';
COMMENT ON COLUMN organization_subscriptions.is_current            IS 'TRUE on the row that governs current access. Enforced unique-per-org via partial index.';

CREATE TRIGGER organization_subscriptions_updated_at
  BEFORE UPDATE ON organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;

-- Members read the entitlement; admins read history; writes are
-- service-role only (webhook handler).
CREATE POLICY organization_subscriptions_select_member
  ON organization_subscriptions FOR SELECT
  USING (is_organization_member(organization_id));

-- No INSERT / UPDATE / DELETE policies — writes require service-role
-- (the Stripe webhook handler). Anon/auth users cannot mutate billing.

-- ─────────────────────────────────────────────────────────────
-- organization_invitations — pending invites with 7-day expiry
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_invitations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  email               VARCHAR(255) NOT NULL,
  role                VARCHAR(20) NOT NULL DEFAULT 'member'
                      CHECK (role IN ('admin', 'member')),

  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),

  -- Bearer token in the invite-acceptance link. Must be unique across
  -- all orgs to avoid cross-tenant token collisions.
  token               TEXT NOT NULL UNIQUE,

  invited_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at         TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organization_invitations_valid_email
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$')
);

-- A given org should have at most one pending invite for a given email
-- at a time. Revoked or expired ones can coexist.
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_one_pending_per_email
  ON organization_invitations(organization_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_organization_invitations_org
  ON organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_invitations_status_org
  ON organization_invitations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_organization_invitations_email_pending
  ON organization_invitations(lower(email))
  WHERE status = 'pending';

COMMENT ON TABLE  organization_invitations          IS 'Pending invite tokens with 7-day default expiry. Seat-counting includes status=pending rows toward the org cap.';
COMMENT ON COLUMN organization_invitations.token    IS 'Bearer secret in the /invite/[token] URL. Unique globally to prevent cross-tenant collisions.';
COMMENT ON COLUMN organization_invitations.expires_at IS 'Default = NOW() + 7 days. Status transitions to expired on first read past this point (background or read-time).';

CREATE TRIGGER organization_invitations_updated_at
  BEFORE UPDATE ON organization_invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Admins see and manage invites in their org. Invitees see their own
-- pending invite by matching their email to email (case-insensitive).
CREATE POLICY organization_invitations_select_admin
  ON organization_invitations FOR SELECT
  USING (is_organization_admin(organization_id));

CREATE POLICY organization_invitations_select_invitee
  ON organization_invitations FOR SELECT
  USING (
    status = 'pending'
    AND lower(email) = lower((
      SELECT email FROM auth.users WHERE id = auth.uid()
    ))
  );

CREATE POLICY organization_invitations_admin_insert
  ON organization_invitations FOR INSERT
  WITH CHECK (is_organization_admin(organization_id));

CREATE POLICY organization_invitations_admin_update
  ON organization_invitations FOR UPDATE
  USING      (is_organization_admin(organization_id))
  WITH CHECK (is_organization_admin(organization_id));

CREATE POLICY organization_invitations_admin_delete
  ON organization_invitations FOR DELETE
  USING (is_organization_admin(organization_id));

-- ─────────────────────────────────────────────────────────────
-- stripe_events — webhook idempotency dedupe (service-role only)
-- ─────────────────────────────────────────────────────────────
--
-- The webhook handler INSERTs into this table FIRST (with status =
-- 'pending') before doing any state-changing work. If the INSERT
-- conflicts on stripe_event_id, the event is a duplicate and the
-- handler returns 2xx without re-processing. On successful processing
-- the row is updated to status='processed' with processed_at set.
-- On failure, attempt_count is bumped so retries are observable.

CREATE TABLE IF NOT EXISTS stripe_events (
  stripe_event_id      TEXT PRIMARY KEY,
  type                 TEXT NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'processed', 'error')),
  attempt_count        INTEGER NOT NULL DEFAULT 0,
  error                TEXT,

  -- Stripe's own timestamps for ordering / drift detection
  event_created_at     TIMESTAMPTZ,

  received_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at         TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type        ON stripe_events(type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_status      ON stripe_events(status);
CREATE INDEX IF NOT EXISTS idx_stripe_events_received_at ON stripe_events(received_at DESC);

COMMENT ON TABLE  stripe_events                  IS 'Webhook idempotency dedupe. Insert with status=pending first, then update to processed/error. Service-role writes only.';
COMMENT ON COLUMN stripe_events.event_created_at IS 'Stripe''s event.created timestamp — used by the drift-detection script to order events across delayed deliveries.';
COMMENT ON COLUMN stripe_events.attempt_count    IS 'Bumped on each processing attempt. Useful for triage of stuck rows.';

CREATE TRIGGER stripe_events_updated_at
  BEFORE UPDATE ON stripe_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS enabled with NO policies = effectively service-role only. End-user
-- code never reads or writes stripe_events.
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- Notes for follow-up migrations
-- ─────────────────────────────────────────────────────────────
--
-- 1. Tenant ownership backfill: a follow-up migration adds
--    organization_id to rolls, cuts, purchase_orders, jobs, etc. and
--    rewrites their RLS to use is_organization_member(organization_id)
--    in place of (auth.uid() = user_id). Ship after PR 1 + PR 4 are
--    exercised end-to-end on staging.
--
-- 2. Seat cap enforcement: PR 6 adds the get_organization_seat_usage()
--    helper that returns (purchased, active_members, pending_invites,
--    used, available) for an org. PR 1 keeps the underlying status
--    fields in place so PR 6 can ship without further schema changes.
--
-- 3. Profiles linkage: organization_members.user_id references
--    auth.users(id) (not profiles.id) to match the existing FK
--    pattern. profiles.id == auth.users.id so the join still works.
