-- Migration: 20260512000002_pr6_invitation_rpcs.sql
-- Rubberfit Stripe Phase 6 — atomic invite-accept + public preview RPCs.
--
-- Two SECURITY DEFINER functions sit on top of the PR 1 schema:
--
--   accept_organization_invitation(token, actor_id, actor_email, accepted_at)
--     — atomic accept: lock the invite row, validate token state, validate
--       email match, validate org subscription is trialing/active, insert
--       organization_members(status='active', role=invite.role), update
--       organization_invitations(status='accepted'). Returns a typed code.
--       Authenticated invitees call this; their RLS cannot otherwise update
--       organization_invitations or read organization_subscriptions.
--
--   get_invitation_preview_by_token(token)
--     — minimal read for the public /invite/[token] landing page. Returns
--       only what the UI needs to render. Anonymous + authenticated callers.
--       The token itself is the bearer secret; once you have it you can see
--       the org name, role, and lifecycle status.
--
-- Both are SECURITY DEFINER so they bypass RLS by design. EXECUTE is granted
-- only to the runtime roles that need it; service-role bypasses RLS already
-- and does not need EXECUTE on these.

-- ─────────────────────────────────────────────────────────────
-- accept_organization_invitation — atomic accept transaction
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION accept_organization_invitation(
  p_token        TEXT,
  p_actor_id     UUID,
  p_actor_email  TEXT,
  p_accepted_at  TIMESTAMPTZ
) RETURNS TABLE (
  result_code     TEXT,
  organization_id UUID,
  membership_id   UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite             organization_invitations%ROWTYPE;
  v_subscription_status TEXT;
  v_existing_member_id UUID;
  v_new_member_id      UUID;
BEGIN
  -- Lock the invite row up-front to serialize concurrent accept attempts.
  SELECT *
    INTO v_invite
    FROM organization_invitations
    WHERE token = p_token
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Status checks before any mutation. expired-by-clock is handled below
  -- so we can opportunistically transition pending → expired.
  IF v_invite.status = 'accepted' THEN
    RETURN QUERY SELECT 'already_accepted'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  IF v_invite.status = 'revoked' THEN
    RETURN QUERY SELECT 'revoked'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  IF v_invite.status = 'expired' THEN
    RETURN QUERY SELECT 'expired'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- pending past expiry → flip to expired and return.
  IF v_invite.expires_at <= p_accepted_at THEN
    UPDATE organization_invitations
       SET status = 'expired', updated_at = p_accepted_at
       WHERE id = v_invite.id;
    RETURN QUERY SELECT 'expired'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Case-insensitive email match. The token alone is not enough — we want
  -- the invited address to match the authenticated actor so a shared link
  -- can't be redeemed by a different account.
  IF lower(v_invite.email) <> lower(p_actor_email) THEN
    RETURN QUERY SELECT 'email_mismatch'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- The org must have an active billing relationship for the invitee to
  -- get access. This is the recovery-style "is the org paid up?" gate —
  -- distinct from the actor's own subscription which they may not have.
  SELECT status
    INTO v_subscription_status
    FROM organization_subscriptions
    WHERE organization_id = v_invite.organization_id
      AND is_current = TRUE
    LIMIT 1;

  IF v_subscription_status IS NULL
     OR v_subscription_status NOT IN ('trialing', 'active') THEN
    RETURN QUERY SELECT 'org_subscription_inactive'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- v1 enforces UNIQUE(user_id) on organization_members. Three cases:
  --   • No existing row → INSERT.
  --   • Existing row in the SAME org with status='deactivated' or 'removed'
  --     → reactivate in place (preserves the original id, joined_at).
  --   • Existing row in a DIFFERENT org, or active in this org → reject
  --     with membership_exists so the UI can surface a clear message
  --     instead of letting the unique violation bubble.
  SELECT id
    INTO v_existing_member_id
    FROM organization_members
    WHERE user_id = p_actor_id
      AND organization_id = v_invite.organization_id
      AND status IN ('deactivated', 'removed')
    LIMIT 1;

  IF v_existing_member_id IS NOT NULL THEN
    UPDATE organization_members
       SET status         = 'active',
           role           = v_invite.role,
           invited_by     = v_invite.invited_by,
           deactivated_at = NULL,
           updated_at     = p_accepted_at
       WHERE id = v_existing_member_id;
    v_new_member_id := v_existing_member_id;
  ELSE
    -- Look for any other membership (different org or active in this org).
    SELECT id
      INTO v_existing_member_id
      FROM organization_members
      WHERE user_id = p_actor_id
      LIMIT 1;

    IF v_existing_member_id IS NOT NULL THEN
      RETURN QUERY SELECT 'membership_exists'::TEXT, NULL::UUID, NULL::UUID;
      RETURN;
    END IF;

    -- Both writes happen inside the same implicit transaction; a raised
    -- exception below would roll both back.
    INSERT INTO organization_members (
      organization_id,
      user_id,
      role,
      status,
      invited_by,
      joined_at
    ) VALUES (
      v_invite.organization_id,
      p_actor_id,
      v_invite.role,
      'active',
      v_invite.invited_by,
      p_accepted_at
    )
    RETURNING id INTO v_new_member_id;
  END IF;

  UPDATE organization_invitations
     SET status      = 'accepted',
         accepted_at = p_accepted_at,
         updated_at  = p_accepted_at
     WHERE id = v_invite.id;

  RETURN QUERY SELECT
    'ok'::TEXT,
    v_invite.organization_id,
    v_new_member_id;
END;
$$;

COMMENT ON FUNCTION accept_organization_invitation(TEXT, UUID, TEXT, TIMESTAMPTZ) IS
  'PR 6: atomic invite acceptance. Locks the invite row, validates token state, '
  'enforces email match, requires an active org subscription, inserts a new '
  'organization_members row with status=active, and marks the invite accepted. '
  'Returns (result_code, organization_id, membership_id). Recovery-style: callable '
  'by an invitee whose own RLS would not otherwise let them touch invitations.';

-- The accept RPC is invoked by server actions running as the authenticated
-- caller. The 'authenticated' role exists in Supabase by default; granting
-- EXECUTE here lets PostgREST + the cookie-bound supabase-js client call
-- the function via rpc('accept_organization_invitation', { ... }).
REVOKE ALL ON FUNCTION accept_organization_invitation(TEXT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION accept_organization_invitation(TEXT, UUID, TEXT, TIMESTAMPTZ)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- get_invitation_preview_by_token — public preview for /invite/[token]
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_invitation_preview_by_token(p_token TEXT)
RETURNS TABLE (
  invitation_id      UUID,
  organization_id    UUID,
  organization_name  VARCHAR(200),
  email              VARCHAR(255),
  role               VARCHAR(20),
  status             VARCHAR(20),
  expires_at         TIMESTAMPTZ,
  inviter_name       TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    i.id                AS invitation_id,
    i.organization_id   AS organization_id,
    o.name              AS organization_name,
    i.email             AS email,
    i.role              AS role,
    i.status            AS status,
    i.expires_at        AS expires_at,
    p.full_name         AS inviter_name
  FROM organization_invitations i
  JOIN organizations           o ON o.id = i.organization_id
  LEFT JOIN profiles           p ON p.id = i.invited_by
  WHERE i.token = p_token
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_invitation_preview_by_token(TEXT) IS
  'PR 6: read-only invite preview for the /invite/[token] landing page. '
  'Returns only fields the UI needs to render the accept/expired/revoked/etc. '
  'states. Callable by anonymous + authenticated roles; the token itself is '
  'the bearer secret.';

REVOKE ALL ON FUNCTION get_invitation_preview_by_token(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_invitation_preview_by_token(TEXT)
  TO anon, authenticated, service_role;
