import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import type { ActionActor } from "@/src/application/types/action-actor"
import { resolveActiveTenantId } from "@/src/infrastructure/services/active-tenant.service"
import { getProfileAccess } from "@/src/infrastructure/services/authService"

import { ACTIVE_TENANT_COOKIE } from "./active-tenant"
import { AuthConfigError, UnauthorizedError } from "./errors"

export type { ActionActor }

/**
 * The first line of every server action. Resolves the caller from the
 * request cookies and returns their `ActionActor`. Throws on:
 *
 * - `AuthConfigError` if Supabase env is missing (5xx-class)
 * - `UnauthorizedError` if no session, no profile row, or the account
 *   is inaccessible (no active memberships and not a platform admin)
 *
 * Tenant resolution:
 *   1. Read the `rema_active_tenant` cookie. The middleware sets it
 *      on the first permission-gated request; the chooser action sets
 *      it on explicit tenant switches. Treated as a hint — RLS is the
 *      authority, but we validate against the user's active memberships
 *      so the actor never carries a tenant id the user doesn't belong
 *      to.
 *   2. If the cookie is missing, fall back to
 *      `profiles.last_active_tenant_id` then oldest active membership
 *      (see `resolveActiveTenantId`). This keeps actions usable when
 *      the cookie is cold (e.g., first action call after cookie
 *      expiry, before middleware writes a new one).
 *   3. If no tenant resolves at all, `actor.activeTenantId` is `null`.
 *      Actions that need tenant context must call
 *      `requireActiveTenant(actor)` to fail closed.
 *
 * Roles are scoped to the active tenant when one resolves. Without an
 * active tenant the actor carries the union of roles across all
 * memberships, which keeps proxy permission checks working in the
 * pre-chooser window.
 *
 * Profile read is delegated to `getProfileAccess`. That helper does
 * the membership + tenant-roles read in one round-trip.
 */
export async function requireAuthenticatedUser(): Promise<ActionActor> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new AuthConfigError()

  const cookieStore = await cookies()
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // Server actions don't refresh tokens; the route layout owns that.
      setAll: () => {},
    },
  })

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()
  if (authError || !user) throw new UnauthorizedError()

  const cookieHint = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value ?? null

  let activeTenantId: string | null
  try {
    activeTenantId = await resolveActiveTenantId(client, user.id, cookieHint)
  } catch (_err) {
    throw new UnauthorizedError("Tenant resolution failed")
  }

  let access
  try {
    access = await getProfileAccess(client, user.id, activeTenantId)
  } catch (_err) {
    throw new UnauthorizedError("Profile lookup failed")
  }
  if (!access.hasProfile) throw new UnauthorizedError("Profile not found")
  if (access.isInaccessible) throw new UnauthorizedError("Account deactivated")

  return {
    id: user.id,
    email: user.email ?? "",
    roles: access.roles,
    isSuperAdmin: access.isSuperAdmin,
    activeTenantId,
  }
}

/**
 * Soft session check for public pages (e.g. `/invite/[token]`) that
 * need to behave differently for signed-in vs signed-out visitors but
 * without throwing on the signed-out path.
 *
 * Deliberately does NOT load the profile or memberships — the
 * canonical caller is the invitation accept page, where the visitor
 * MAY be a brand-new user with no memberships yet (which would make
 * `requireAuthenticatedUser` throw "Account deactivated"). We only
 * need their auth identity (id + email) to gate the email-match check
 * and the Accept CTA visibility.
 *
 * Returns `null` on any branch where the user can't be resolved
 * (missing env, no session, auth error). Callers treat both "no
 * session" and "auth error" the same: signed-out.
 */
export interface OptionalUser {
  id: string
  email: string
}

export async function getOptionalUser(): Promise<OptionalUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null

  const cookieStore = await cookies()
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  })

  const {
    data: { user },
    error,
  } = await client.auth.getUser()
  if (error || !user) return null
  return { id: user.id, email: user.email ?? "" }
}
