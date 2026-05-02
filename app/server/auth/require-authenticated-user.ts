import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import type { ActionActor } from "@/src/application/types/action-actor"

import { AuthConfigError, UnauthorizedError } from "./errors"

export type { ActionActor }

/**
 * The first line of every server action. Resolves the caller from the
 * request cookies and returns their `ActionActor`. Throws on:
 *
 * - `AuthConfigError` if Supabase env is missing (5xx-class)
 * - `UnauthorizedError` if no session, no profile row, or the profile
 *   is soft-deleted (`is_deleted = true`)
 *
 * Server actions ship action IDs in the client bundle — the route-level
 * proxy gates page navigation but cannot gate action invocations. Each
 * action MUST call this (and `requirePermission`) at entry.
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

  // Single round-trip: roles + super_admin + is_deleted in one query.
  // Reusing `getProfileAccess` from authService would force a second
  // query for `is_deleted`; we keep the read inline for now and
  // refactor the shared helper in a follow-up.
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("roles, super_admin, is_deleted")
    .eq("id", user.id)
    .maybeSingle<{
      roles: string[] | null
      super_admin: boolean | null
      is_deleted: boolean | null
    }>()

  if (profileError) throw new UnauthorizedError("Profile lookup failed")
  if (!profile) throw new UnauthorizedError("Profile not found")
  if (profile.is_deleted === true) throw new UnauthorizedError("Account deactivated")

  return {
    id: user.id,
    email: user.email ?? "",
    roles: Array.isArray(profile.roles) ? profile.roles : [],
    isSuperAdmin: profile.super_admin === true,
  }
}
