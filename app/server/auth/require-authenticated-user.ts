import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import type { ActionActor } from "@/src/application/types/action-actor"
import { getProfileAccess } from "@/src/infrastructure/services/authService"

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
 * Server actions ship action IDs in the client bundle — the route-level
 * proxy gates page navigation but cannot gate action invocations. Each
 * action MUST call this (and `requirePermission`) at entry.
 *
 * Profile read is delegated to `getProfileAccess`. That helper unions
 * roles across active memberships and collapses "missing profile" /
 * "no active memberships" / "deactivated mid-session" into a single
 * `isInaccessible` deny-flag so middleware (proxy.ts), API admin
 * guards (require-admin.ts), and the action layer share one
 * round-trip and one fail-closed check.
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

  let access
  try {
    access = await getProfileAccess(client, user.id)
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
  }
}
