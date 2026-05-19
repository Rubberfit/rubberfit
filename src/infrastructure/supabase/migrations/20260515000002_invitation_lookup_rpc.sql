-- ═══════════════════════════════════════════════════════════════════════════
-- ARC-25 — File 13: get_invitation_by_token RPC
-- ═══════════════════════════════════════════════════════════════════════════
-- Public-safe lookup for the /invite/[token] landing page. Returns the
-- subset of invitation fields the page needs to render personalized content
-- (tenant name, invited email, roles, expiry, terminal-state timestamps).
--
-- SECURITY DEFINER because:
--   • the canonical caller is a brand-new user with no memberships, and the
--     RLS policy on `invitations` scopes reads to the inviting tenant's
--     members; without DEFINER they can't read the row.
--   • the security boundary is "knowing the token". A 32-byte hex token is
--     ~256 bits of entropy — anyone with it can see the same fields the
--     invitation email already exposed to them.
--
-- Returns NULL row when the token doesn't match (no leakage about whether
-- the token ever existed). Omits invited_by, last_send_error,
-- last_send_attempt_at — those are admin-only and live behind RLS.
-- EXECUTE granted to anon + authenticated (the page is public).
-- ═══════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token text)
RETURNS TABLE (
  tenant_id   uuid,
  tenant_name text,
  email       text,
  roles       text[],
  expires_at  timestamptz,
  accepted_at timestamptz,
  revoked_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT i.tenant_id,
         t.name        AS tenant_name,
         i.email::text AS email,
         i.roles,
         i.expires_at,
         i.accepted_at,
         i.revoked_at
    FROM invitations i
    JOIN tenants     t ON t.id = i.tenant_id
   WHERE i.token = p_token;
$$;


REVOKE ALL ON FUNCTION get_invitation_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION get_invitation_by_token(text) TO anon, authenticated;


COMMENT ON FUNCTION get_invitation_by_token(text) IS
  'Public-safe lookup of an invitation by token for the /invite/[token] landing page. Returns tenant name + invited email + roles + expiry + terminal-state stamps. SECURITY DEFINER bypasses RLS so a brand-new user (no memberships) can fetch the row. Omits invited_by + last_send_error — admin-only fields stay behind RLS.';
