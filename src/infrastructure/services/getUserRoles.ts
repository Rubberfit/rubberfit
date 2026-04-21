import type { SupabaseClient } from "@supabase/supabase-js"
import { DEFAULT_ROLES, type AppRole } from "@/src/application/permissions"

/**
 * Resolve a user's effective roles against the new schema.
 *
 * Precedence:
 *   1. profiles.is_platform_admin = true → ["admin"] (bypasses tenant checks
 *      elsewhere; here it grants admin-level permission names)
 *   2. Aggregate memberships.roles across all active memberships
 *   3. DEFAULT_ROLES (["member"]) if neither applies
 *
 * Takes any supabase-js client — works for browser, server-auth, or
 * service-role variants. Returns the role list as strings (callers can
 * cast to AppRole[] if they need the narrowed type).
 */
export async function getUserRoles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  userId: string
): Promise<AppRole[]> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle()

  if (profile?.is_platform_admin) {
    return ["admin"]
  }

  const { data: memberships } = await supabase
    .from("memberships")
    .select("roles")
    .eq("profile_id", userId)
    .is("deleted_at", null)

  const aggregated = (memberships ?? []).flatMap((m) => (m.roles ?? []) as string[])
  return (aggregated.length > 0 ? aggregated : [...DEFAULT_ROLES]) as AppRole[]
}
