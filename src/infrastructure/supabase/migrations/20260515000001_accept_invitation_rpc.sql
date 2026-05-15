-- ═══════════════════════════════════════════════════════════════════════════
-- ARC-25 — File 12: accept_invitation RPC
-- ═══════════════════════════════════════════════════════════════════════════
-- Atomic accept-invitation: stamps invitations.accepted_at AND inserts the
-- memberships row in one transaction. Failure mid-transaction rolls both back.
--
-- SECURITY DEFINER because the canonical accept happens for users who have
-- ZERO memberships at the moment of accept (brand-new signup → first
-- invitation → membership). Without DEFINER they couldn't INSERT into
-- memberships under the existing RLS policy (which scopes writes to the
-- inviting tenant's admins). EXECUTE is granted only to `authenticated`,
-- not anon, so a token alone is not enough — you must be signed in.
--
-- All authorization happens inside the function:
--   • caller must be authenticated (auth.uid() not null)
--   • token must exist
--   • invitation must not be already accepted, revoked, or expired
--   • caller's auth.users.email must case-insensitively match invitations.email
--
-- Errors propagate via custom SQLSTATE codes so the application layer can
-- discriminate without parsing message strings:
--   P0001  auth required
--   P0002  invitation not found
--   P0003  already accepted
--   P0004  revoked
--   P0005  expired
--   P0006  email mismatch
-- ═══════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION accept_invitation(p_token text)
RETURNS TABLE (membership_id uuid, tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_user_email   text;
  v_invitation   invitations%ROWTYPE;
  v_membership_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'auth required';
  END IF;

  SELECT * INTO v_invitation
    FROM invitations
   WHERE token = p_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'invitation not found';
  END IF;

  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0003', MESSAGE = 'already accepted';
  END IF;

  IF v_invitation.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0004', MESSAGE = 'revoked';
  END IF;

  IF v_invitation.expires_at < now() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'expired';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF lower(v_invitation.email) <> lower(coalesce(v_user_email, '')) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'email mismatch';
  END IF;

  -- Resurrect a soft-deleted membership (re-invite case) or insert fresh.
  -- The unique constraint is on (tenant_id, profile_id) regardless of
  -- deleted_at, so ON CONFLICT fires for soft-deleted rows too.
  INSERT INTO memberships (tenant_id, profile_id, roles, invited_by)
  VALUES (
    v_invitation.tenant_id,
    v_user_id,
    v_invitation.roles,
    v_invitation.invited_by
  )
  ON CONFLICT (tenant_id, profile_id) DO UPDATE
     SET deleted_at = NULL,
         roles      = EXCLUDED.roles,
         invited_by = EXCLUDED.invited_by,
         updated_at = now()
  RETURNING id INTO v_membership_id;

  UPDATE invitations
     SET accepted_at = now()
   WHERE id = v_invitation.id;

  RETURN QUERY SELECT v_membership_id, v_invitation.tenant_id;
END;
$$;


REVOKE ALL ON FUNCTION accept_invitation(text) FROM public;
GRANT EXECUTE ON FUNCTION accept_invitation(text) TO authenticated;


COMMENT ON FUNCTION accept_invitation(text) IS
  'Atomic invitation accept: validates token + email-match, then in one transaction stamps invitations.accepted_at and inserts (or resurrects) the memberships row. SECURITY DEFINER bypasses RLS for the brand-new-user case where the caller has zero memberships yet. Errors use custom SQLSTATEs P0001-P0006 — see migration body for the table.';
