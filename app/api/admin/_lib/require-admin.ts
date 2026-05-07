import { NextResponse } from "next/server"

import { makeAuthClient, makeAdminClient } from "@/src/infrastructure/supabase/server-clients"
import { getProfileAccess } from "@/src/infrastructure/services/authService"

/**
 * Result of a successful admin authorization.
 *
 * The caller gets the authenticated user id plus two ready-to-use Supabase
 * clients: the auth client (scoped to the caller's cookies, RLS-bound) and
 * the admin client (service role, RLS-bypassing). Both are returned so each
 * route can pick the right one for the query it's about to run.
 */
export interface AdminContext {
  userId: string
  userEmail: string | null
  authClient: NonNullable<ReturnType<typeof makeAuthClient>>
  adminClient: NonNullable<ReturnType<typeof makeAdminClient>>
}

export type AdminGuardResult =
  | { ok: true; ctx: AdminContext }
  | { ok: false; response: NextResponse<{ error: string }> }

/**
 * Every admin-only API route repeats the same dance: build an auth client,
 * resolve the caller, build the admin client, load the profile, and check
 * roles. This helper hides all of that so routes stay focused on what they
 * actually do.
 *
 * On failure it returns a ready-to-send NextResponse (401 / 403 / 500).
 * On success it returns an `AdminContext` with the clients and user id.
 */
export async function requireAdmin(request: Request): Promise<AdminGuardResult> {
  const authClient = makeAuthClient(request as Parameters<typeof makeAuthClient>[0])
  if (!authClient) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Server misconfiguration" }, { status: 500 }),
    }
  }

  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const adminClient = makeAdminClient()
  if (!adminClient) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Service role key not configured" }, { status: 500 }),
    }
  }

  let access
  try {
    access = await getProfileAccess(adminClient, user.id)
  } catch (_error) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Failed to load profile" }, { status: 500 }),
    }
  }

  // Deactivated user (or no profile row) — fail closed. Sign-in
  // already rejects deactivated accounts, but a user deactivated
  // mid-session keeps a valid JWT until expiry. 401 (not 403) so the
  // client treats it like a session-invalid event and bounces to
  // login, matching the proxy.ts deactivation flow.
  if (access.isDeleted) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Account deactivated" }, { status: 401 }),
    }
  }

  const isAuthorized = access.isSuperAdmin || access.roles.includes("admin")

  if (!isAuthorized) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      userEmail: user.email ?? null,
      authClient,
      adminClient,
    },
  }
}
