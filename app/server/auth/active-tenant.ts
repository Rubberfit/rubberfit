import { cookies } from "next/headers"
import type { NextResponse } from "next/server"
import type { CookieOptions } from "@supabase/ssr"

/**
 * Cookie name + lifetime for the request-level active-tenant
 * indicator. The cookie expresses *intent* — which tenant the user
 * wants to act in right now. RLS provides *authority*: even if a
 * client tampers with the cookie to point at a tenant they don't
 * belong to, the database refuses to return that tenant's data.
 *
 * Lifetime is 24h. Renewed on every middleware recovery cycle (and on
 * every explicit tenant-switch action in step 3), so the practical
 * effect is "expires after 24h of inactivity" rather than a hard wall
 * clock. Idle longer than that and the next request re-resolves from
 * `profiles.last_active_tenant_id`.
 */
export const ACTIVE_TENANT_COOKIE = "rema_active_tenant"
export const ACTIVE_TENANT_MAX_AGE_SECONDS = 24 * 60 * 60

export function buildActiveTenantCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ACTIVE_TENANT_MAX_AGE_SECONDS,
    path: "/",
  }
}

/**
 * Reads the active-tenant cookie inside a server context that uses
 * `next/headers` cookies (server actions, route handlers). Returns
 * the raw cookie value — callers MUST treat it as a *hint* and
 * validate it against the user's active memberships before trusting
 * it for any tenant-scoped operation.
 */
export async function readActiveTenantCookie(): Promise<string | null> {
  const store = await cookies()
  return store.get(ACTIVE_TENANT_COOKIE)?.value ?? null
}

/**
 * Writes the active-tenant cookie onto a NextResponse. Used by the
 * proxy middleware and the OAuth callback, both of which already
 * thread response objects through their cookie pipelines.
 */
export function applyActiveTenantCookie(response: NextResponse, tenantId: string): void {
  response.cookies.set(ACTIVE_TENANT_COOKIE, tenantId, buildActiveTenantCookieOptions())
}

/**
 * Builds the `(name, value, options)` triple the OAuth callback
 * pushes into its `pendingCookies` array (alongside Supabase's own
 * session cookies). Use this when you already have a pendingCookies
 * pipeline; for direct writes use `applyActiveTenantCookie`.
 */
export function makeActiveTenantPendingCookie(tenantId: string): {
  name: string
  value: string
  options: CookieOptions
} {
  return {
    name: ACTIVE_TENANT_COOKIE,
    value: tenantId,
    options: buildActiveTenantCookieOptions(),
  }
}
