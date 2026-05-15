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
 * Tenant the caller can switch to, with the roles they hold there.
 * Returned by `listAccessibleTenants` to render the chooser UI.
 */
export interface AccessibleTenant {
  tenantId: string
  name: string
  slug: string
  roles: string[]
}

interface MembershipWithTenantRow {
  roles: string[] | null
  tenant:
    | { id: string; name: string; slug: string }
    | { id: string; name: string; slug: string }[]
    | null
}

/**
 * Lists every tenant the caller has an active membership in, with the
 * roles they hold per tenant. Ordered oldest-membership-first so the
 * chooser UI has a stable, predictable surface ("first one you joined
 * lands at the top"). Used by the /select-tenant chooser page.
 *
 * Filters `memberships.deleted_at IS NULL` so a per-tenant deactivation
 * removes that row from the chooser silently — the user can't re-pick
 * a tenant they've been removed from.
 */
export async function listAccessibleTenants(
  client: SupabaseClient,
  profileId: string
): Promise<AccessibleTenant[]> {
  const { data, error } = await client
    .from("memberships")
    .select(
      `
      roles,
      tenant:tenants!inner ( id, name, slug )
    `
    )
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("listAccessibleTenants failed:", error)
    throw error
  }

  return ((data ?? []) as unknown as MembershipWithTenantRow[])
    .map((row) => {
      const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant
      if (!tenant) return null
      return {
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        roles: row.roles ?? [],
      }
    })
    .filter((t): t is AccessibleTenant => t !== null)
}

/**
 * Returns `true` when the caller has an active (non-deleted)
 * membership in the target tenant. Used by the chooser action to
 * validate user input before persisting the cookie + last_active —
 * we don't want the actor to carry (or the cookie to advertise) a
 * tenant id the user can't actually act in.
 *
 * Throws on read errors so the caller can map to a 403/500 instead
 * of silently denying.
 */
export async function verifyTenantMembership(
  client: SupabaseClient,
  profileId: string,
  tenantId: string
): Promise<boolean> {
  const { data, error } = await client
    .from("memberships")
    .select("tenant_id")
    .eq("profile_id", profileId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) {
    console.error("verifyTenantMembership failed:", error)
    throw error
  }
  return data !== null
}

/**
 * Returns `tenants.name` for the given id. Throws on read error;
 * returns `null` if no row matches (treat as "tenant deleted under us"
 * — the caller decides whether to surface a friendly message or
 * propagate as a 500).
 *
 * Used by the invitation flow (CreateInvitationUseCase) to populate
 * the email template's "You've been invited to <tenantName>" line
 * without giving the use case a direct `.from()` call.
 */
export async function loadTenantName(
  client: SupabaseClient,
  tenantId: string
): Promise<string | null> {
  const { data, error } = await client
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle()
  if (error) {
    console.error("loadTenantName failed:", error)
    throw error
  }
  return (data as { name: string } | null)?.name ?? null
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
