import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Active-tenant resolution for the multi-tenant request boundary.
 *
 * Order of preference:
 *   1. `hint` — typically the value of the `rema_active_tenant` cookie.
 *      Honored only if the caller has an active membership in that
 *      tenant. A user can set any cookie value; RLS already prevents
 *      cross-tenant reads, but trusting an unvalidated cookie value
 *      would route the UI to a tenant the user doesn't belong to and
 *      surface as silent empty results everywhere.
 *   2. `profiles.last_active_tenant_id` — the persisted "last picked"
 *      tenant. Also membership-validated (the user might have been
 *      removed from that tenant after their last login).
 *   3. Oldest active membership row — the deterministic fallback so
 *      single-tenant users land on their one tenant without
 *      configuration.
 *
 * Returns `null` when the caller has zero active memberships. Callers
 * decide what to do: the login callback persists nothing and lets the
 * /select-tenant chooser (step 4) surface an empty state; middleware
 * recovery is a no-op in that case.
 */
export async function resolveActiveTenantId(
  client: SupabaseClient,
  profileId: string,
  hint?: string | null
): Promise<string | null> {
  if (hint) {
    const { data: hinted } = await client
      .from("memberships")
      .select("tenant_id")
      .eq("profile_id", profileId)
      .eq("tenant_id", hint)
      .is("deleted_at", null)
      .maybeSingle()
    const hintedRow = hinted as { tenant_id: string } | null
    if (hintedRow) return hintedRow.tenant_id
  }

  const { data: profile } = await client
    .from("profiles")
    .select("last_active_tenant_id")
    .eq("id", profileId)
    .maybeSingle()
  const lastActive = (profile as { last_active_tenant_id: string | null } | null)
    ?.last_active_tenant_id
  if (lastActive) {
    const { data: lastActiveMembership } = await client
      .from("memberships")
      .select("tenant_id")
      .eq("profile_id", profileId)
      .eq("tenant_id", lastActive)
      .is("deleted_at", null)
      .maybeSingle()
    const lastActiveRow = lastActiveMembership as { tenant_id: string } | null
    if (lastActiveRow) return lastActiveRow.tenant_id
  }

  const { data: oldest } = await client
    .from("memberships")
    .select("tenant_id")
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const oldestRow = oldest as { tenant_id: string } | null
  return oldestRow?.tenant_id ?? null
}

/**
 * Persists `profiles.last_active_tenant_id`. Best-effort — logs and
 * swallows on failure so a transient write hiccup doesn't break the
 * login flow. The cookie is the request-level source of truth; the
 * column is only consulted for next-session recovery.
 */
export async function persistLastActiveTenant(
  client: SupabaseClient,
  profileId: string,
  tenantId: string
): Promise<void> {
  const { error } = await client
    .from("profiles")
    .update({ last_active_tenant_id: tenantId })
    .eq("id", profileId)
  if (error) {
    console.error("persistLastActiveTenant failed:", error)
  }
}
