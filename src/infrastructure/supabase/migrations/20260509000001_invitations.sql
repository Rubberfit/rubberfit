-- ═══════════════════════════════════════════════════════════════════════════
-- ARC-25 — File 11: Invitations
-- ═══════════════════════════════════════════════════════════════════════════
-- Email-based invitation flow for the closed-signup model. New users only
-- enter the system via an accepted invitation; signups without a token route
-- to /no-access.
--
-- Design:
--   • token: random 32-byte hex string. Generated client-side at invite time
--     (server actions live in app/actions/invitations.ts).
--   • expires_at: default 7 days at insert time (set by server action, not
--     by trigger — keeps the schema simple and the policy explicit).
--   • last_send_attempt_at + last_send_error: invitations are dispatched
--     synchronously via emailService (no queue per ARC-25 plan v3 decision
--     #6). On failure, the row stays so admins can resendInvitation.
--   • Active uniqueness via partial unique index — re-inviting after
--     accept/revoke is allowed.
--
-- RLS: members of the inviting tenant SELECT/INSERT/UPDATE/DELETE per role.
-- Invitee reads by token via a route handler (no auth required for the
-- token-bearer read — gated by token possession + expiry).
-- ═══════════════════════════════════════════════════════════════════════════


CREATE TABLE invitations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email                 varchar(320) NOT NULL,
  roles                 text[] NOT NULL,
  token                 text UNIQUE NOT NULL,
  expires_at            timestamptz NOT NULL,
  invited_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  accepted_at           timestamptz,
  revoked_at            timestamptz,
  last_send_attempt_at  timestamptz,
  last_send_error       text,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invitations_email_format
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT invitations_roles_valid CHECK (
    roles <@ ARRAY['admin', 'manager', 'supervisor', 'cutter', 'member', 'viewer']::text[]
    AND array_length(roles, 1) > 0
  ),
  CONSTRAINT invitations_not_both_terminal
    CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL))
);


-- Only one *active* invitation per (tenant, email).
-- Re-inviting after accept/revoke is allowed.
CREATE UNIQUE INDEX invitations_active_unique
  ON invitations (tenant_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Index for the team-management UI's "list pending invitations" query.
CREATE INDEX invitations_tenant_pending
  ON invitations (tenant_id, created_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Token lookup is already O(1) via the UNIQUE constraint, but adding an
-- explicit index here documents intent for the route-handler read path.
CREATE INDEX idx_invitations_token ON invitations(token);


COMMENT ON TABLE invitations IS
  'Email-based invitation flow. Closed-signup model: new users only enter via an accepted invitation. Tokens are random hex; expiry is 7 days by default (set by server action).';
COMMENT ON COLUMN invitations.token IS
  'Random 32-byte hex string. Used in the invitation URL. Single-use enforced by the partial unique index on active rows + the accept handler clearing the unique condition.';
COMMENT ON COLUMN invitations.last_send_error IS
  'Populated when emailService.sendInvitation throws. Cleared by resendInvitation on a successful retry.';


-- Note: invitations does NOT have an updated_at column. The mutation
-- timestamps (accepted_at, revoked_at, last_send_attempt_at) tell the full
-- story; a generic updated_at would be redundant and ambiguous.


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Members of the inviting tenant see all invitations for that tenant.
-- Platform admins see everything.
CREATE POLICY invitations_select_tenant ON invitations
  FOR SELECT
  USING (
    auth_is_platform_admin()
    OR tenant_id IN (SELECT auth_user_tenant_ids())
  );

-- Only tenant admins (or platform admins) can create / revoke / resend.
CREATE POLICY invitations_write_admin ON invitations
  FOR ALL
  USING (
    auth_is_platform_admin()
    OR auth_user_is_admin_of(tenant_id)
  )
  WITH CHECK (
    auth_is_platform_admin()
    OR auth_user_is_admin_of(tenant_id)
  );

-- Note: the public invitation-accept page reads the row by token via a
-- service-role route handler that bypasses RLS, then validates expiry +
-- not-yet-accepted in app code before showing the accept UI. We do NOT
-- expose a token-bearer policy here because doing so would require
-- a SECURITY DEFINER helper that compares the token against a query
-- parameter — fragile vs. just authenticating the route handler.
