import "reflect-metadata"
import { randomUUID } from "node:crypto"

import { injectable } from "tsyringe"

import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import {
  type CreateOrganization,
  type CreateOrganizationMember,
  type Organization,
  type OrganizationInvitation,
  type OrganizationInvitationStatus,
  type OrganizationMember,
  type OrganizationMemberStatus,
  type OrganizationMemberWithProfile,
  type OrganizationRole,
  type OrganizationSeatUsage,
  type OrganizationSubscription,
  type OrganizationWithSubscription,
  type PlanTier,
  type UpdateOrganization,
  type UpdateOrganizationMember,
  type UpsertOrganizationSubscription,
} from "@/src/infrastructure/models/billing"
import {
  type DatabaseClient,
  getDatabaseClient,
} from "@/src/infrastructure/supabase/get-database-client"
import { makeAdminClient } from "@/src/infrastructure/supabase/server-clients"

async function getBillingWriteClient(): Promise<DatabaseClient> {
  return makeAdminClient() ?? (await getDatabaseClient())
}

// The DDD migration renamed organizations→tenants, organization_members→memberships,
// organization_subscriptions→subscriptions. The TS surface (Organization,
// OrganizationMember, OrganizationSubscription) is preserved for caller stability;
// this layer translates DB row shapes ↔ TS interface shapes. New schema differences:
//   • tenants requires a NOT NULL slug — synthesized from name on create
//   • memberships uses roles text[] + deleted_at timestamp (no scalar role/status)
//   • subscriptions has a NOT NULL plan_id FK to plans — resolved via plan_tier
//   • The role enum dropped 'owner' (only 'admin'…'viewer'). 'owner' callers fall
//     through the 'admin' branch they already pair-check. Filed as follow-up.
//   • Six invitation methods were deleted — the new invitation flow lives in
//     src/application/use-cases/invitations/* and goes through accept_invitation
//     RPC directly, not through this service.

interface TenantRow {
  id: string
  name: string
  billing_email: string | null
  stripe_customer_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface MembershipRow {
  id: string
  tenant_id: string
  profile_id: string
  roles: string[]
  invited_by: string | null
  joined_at: string
  deactivated_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

interface InvitationRow {
  id: string
  tenant_id: string
  email: string
  roles: string[]
  token: string
  invited_by: string | null
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
}

interface SubscriptionRow {
  id: string
  tenant_id: string
  stripe_subscription_id: string | null
  stripe_subscription_item_id: string | null
  stripe_price_id: string | null
  stripe_product_id: string | null
  latest_invoice_id: string | null
  plan_tier: PlanTier
  billing_interval: "monthly" | "annual" | null
  seat_count: number
  status: OrganizationSubscription["status"]
  trial_end: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  cancel_at: string | null
  canceled_at: string | null
  last_payment_status: string | null
  last_stripe_event_id: string | null
  last_stripe_event_created_at: string | null
  is_current: boolean
  created_at: string
  updated_at: string
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  const suffix = randomUUID().slice(0, 8)
  return base.length > 0 ? `${base}-${suffix}` : `tenant-${suffix}`
}

function tenantToOrganization(row: TenantRow): Organization {
  return {
    id: row.id,
    name: row.name,
    billing_email: row.billing_email,
    stripe_customer_id: row.stripe_customer_id,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function rolesArrayToRole(roles: readonly string[]): OrganizationRole {
  return roles.includes("admin") ? "admin" : "member"
}

function organizationRoleToRolesArray(role: OrganizationRole): string[] {
  // 'owner' is not a valid role under the DDD schema's CHECK constraint;
  // collapse to 'admin' (the highest available role).
  return role === "admin" || role === "owner" ? ["admin"] : ["member"]
}

function deriveInvitationStatus(row: InvitationRow): OrganizationInvitationStatus {
  if (row.accepted_at !== null) return "accepted"
  if (row.revoked_at !== null) return "revoked"
  if (Date.parse(row.expires_at) < Date.now()) return "expired"
  return "pending"
}

function invitationRowToOrganizationInvitation(row: InvitationRow): OrganizationInvitation {
  const role: Exclude<OrganizationRole, "owner"> = row.roles.includes("admin") ? "admin" : "member"
  return {
    id: row.id,
    organization_id: row.tenant_id,
    email: row.email,
    role,
    status: deriveInvitationStatus(row),
    token: row.token,
    invited_by: row.invited_by,
    expires_at: row.expires_at,
    accepted_at: row.accepted_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
    // The DDD `invitations` table has no `updated_at` column; surface
    // `created_at` so the TS shape stays satisfied. Sort order falls back
    // to created_at, which is monotonic for invitation lifecycles anyway.
    updated_at: row.created_at,
  }
}

function membershipToOrganizationMember(row: MembershipRow): OrganizationMember {
  const status: OrganizationMemberStatus = row.deleted_at !== null ? "deactivated" : "active"
  return {
    id: row.id,
    organization_id: row.tenant_id,
    user_id: row.profile_id,
    role: rolesArrayToRole(row.roles),
    status,
    invited_by: row.invited_by,
    joined_at: row.joined_at,
    deactivated_at: row.deactivated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function subscriptionRowToOrganizationSubscription(row: SubscriptionRow): OrganizationSubscription {
  return {
    id: row.id,
    organization_id: row.tenant_id,
    stripe_subscription_id: row.stripe_subscription_id,
    stripe_subscription_item_id: row.stripe_subscription_item_id,
    stripe_price_id: row.stripe_price_id,
    stripe_product_id: row.stripe_product_id,
    latest_invoice_id: row.latest_invoice_id,
    plan_tier: row.plan_tier,
    billing_interval: row.billing_interval,
    seat_count: row.seat_count,
    status: row.status,
    trial_end: row.trial_end,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    cancel_at_period_end: row.cancel_at_period_end,
    cancel_at: row.cancel_at,
    canceled_at: row.canceled_at,
    last_payment_status: row.last_payment_status,
    last_stripe_event_id: row.last_stripe_event_id,
    last_stripe_event_created_at: row.last_stripe_event_created_at,
    is_current: row.is_current,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function resolvePlanId(supabase: DatabaseClient, tier: PlanTier): Promise<string> {
  const { data, error } = await supabase
    .from("plans")
    .select("id")
    .eq("code", tier)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) {
    throw new Error(`No plans row for code='${tier}'. Seed plans before upserting subscriptions.`)
  }
  return data.id
}

@injectable()
export class OrganizationService implements IOrganizationService {
  // ─── Organization (tenant) CRUD ────────────────────────────────

  async createOrganization(input: CreateOrganization): Promise<Organization> {
    const supabase = await getBillingWriteClient()
    const insertPayload: {
      name: string
      slug: string
      billing_email: string | null
      created_by: string | null
    } = {
      name: input.name,
      slug: slugify(input.name),
      billing_email: input.billing_email,
      created_by: input.created_by,
    }
    const { data, error } = await supabase
      .from("tenants")
      .insert(insertPayload)
      .select("id, name, billing_email, stripe_customer_id, created_by, created_at, updated_at")
      .single<TenantRow>()
    if (error) throw error
    return tenantToOrganization(data)
  }

  async getOrganizationById(id: string): Promise<Organization | null> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, billing_email, stripe_customer_id, created_by, created_at, updated_at")
      .eq("id", id)
      .maybeSingle<TenantRow>()
    if (error) throw error
    return data ? tenantToOrganization(data) : null
  }

  async getOrganizationByStripeCustomerId(stripeCustomerId: string): Promise<Organization | null> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, billing_email, stripe_customer_id, created_by, created_at, updated_at")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle<TenantRow>()
    if (error) throw error
    return data ? tenantToOrganization(data) : null
  }

  async updateOrganization(id: string, updates: UpdateOrganization): Promise<Organization> {
    const supabase = await getBillingWriteClient()
    const { data, error } = await supabase
      .from("tenants")
      .update(updates)
      .eq("id", id)
      .select("id, name, billing_email, stripe_customer_id, created_by, created_at, updated_at")
      .single<TenantRow>()
    if (error) throw error
    return tenantToOrganization(data)
  }

  // ─── Membership ───────────────────────────────────────────────

  async getCurrentOrganizationForUser(userId: string): Promise<Organization | null> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("memberships")
      .select(
        "tenant:tenants(id, name, billing_email, stripe_customer_id, created_by, created_at, updated_at)"
      )
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const joined = (data as { tenant: TenantRow | TenantRow[] | null }).tenant
    if (Array.isArray(joined)) return joined[0] ? tenantToOrganization(joined[0]) : null
    return joined ? tenantToOrganization(joined) : null
  }

  async getCurrentOrganizationWithSubscription(
    userId: string
  ): Promise<OrganizationWithSubscription | null> {
    const org = await this.getCurrentOrganizationForUser(userId)
    if (!org) return null
    const current_subscription = await this.getCurrentSubscription(org.id)
    return { ...org, current_subscription }
  }

  async addMember(input: CreateOrganizationMember): Promise<OrganizationMember> {
    const supabase = await getBillingWriteClient()
    const dbPayload: {
      tenant_id: string
      profile_id: string
      roles: string[]
      invited_by: string | null
      joined_at?: string
      deleted_at: string | null
    } = {
      tenant_id: input.organization_id,
      profile_id: input.user_id,
      roles: organizationRoleToRolesArray(input.role),
      invited_by: input.invited_by ?? null,
      deleted_at: input.status === "deactivated" ? new Date().toISOString() : null,
    }
    if (input.joined_at) dbPayload.joined_at = input.joined_at

    const { data, error } = await supabase
      .from("memberships")
      .insert(dbPayload)
      .select(
        "id, tenant_id, profile_id, roles, invited_by, joined_at, deactivated_at, deleted_at, created_at, updated_at"
      )
      .single<MembershipRow>()
    if (error) throw error
    return membershipToOrganizationMember(data)
  }

  async updateMember(
    memberId: string,
    updates: UpdateOrganizationMember
  ): Promise<OrganizationMember> {
    const supabase = await getDatabaseClient()
    const dbUpdates: Record<string, unknown> = {}
    if (updates.role !== undefined) {
      dbUpdates.roles = organizationRoleToRolesArray(updates.role)
    }
    if (updates.status !== undefined) {
      dbUpdates.deleted_at = updates.status === "active" ? null : new Date().toISOString()
      // Mirror to deactivated_at for audit. deactivated_at is timestamptz null|set;
      // 'removed' status was never written by production but maps to soft-delete too.
      dbUpdates.deactivated_at = updates.status === "active" ? null : new Date().toISOString()
    }
    if (updates.deactivated_at !== undefined) {
      dbUpdates.deactivated_at = updates.deactivated_at
    }

    const { data, error } = await supabase
      .from("memberships")
      .update(dbUpdates)
      .eq("id", memberId)
      .select(
        "id, tenant_id, profile_id, roles, invited_by, joined_at, deactivated_at, deleted_at, created_at, updated_at"
      )
      .single<MembershipRow>()
    if (error) throw error
    return membershipToOrganizationMember(data)
  }

  async deactivateOwnMembership(userId: string): Promise<OrganizationMember> {
    const supabase = makeAdminClient()
    if (!supabase) {
      throw new Error("Supabase service role client is required to leave an organization")
    }

    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("id, tenant_id, profile_id, roles, deleted_at")
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .maybeSingle()
    if (membershipError) throw membershipError
    if (!membership) throw new Error("Active organization membership not found")

    const member = membership as {
      id: string
      tenant_id: string
      profile_id: string
      roles: string[]
      deleted_at: string | null
    }
    if (member.profile_id !== userId) {
      throw new Error("Cannot leave another user's organization membership")
    }

    if (member.roles.includes("admin")) {
      const { data: adminRows, error: adminError } = await supabase
        .from("memberships")
        .select("id, roles")
        .eq("tenant_id", member.tenant_id)
        .is("deleted_at", null)
      if (adminError) throw adminError
      const adminCount = (adminRows ?? []).filter((r) =>
        (r as { roles: string[] }).roles.includes("admin")
      ).length
      if (adminCount <= 1) {
        throw new Error("Cannot leave organization as the last admin")
      }
    }

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from("memberships")
      .update({ deleted_at: now, deactivated_at: now })
      .eq("id", member.id)
      .eq("profile_id", userId)
      .select(
        "id, tenant_id, profile_id, roles, invited_by, joined_at, deactivated_at, deleted_at, created_at, updated_at"
      )
      .single<MembershipRow>()
    if (error) throw error
    return membershipToOrganizationMember(data)
  }

  async listMembers(organizationId: string): Promise<OrganizationMemberWithProfile[]> {
    const supabase = await getDatabaseClient()

    // Defensive two-query join — the auto-discovered FK between memberships
    // and profiles works in most envs but PGRST200 has historically tripped
    // when the schema cache lags. Doing the join in app code is resilient.
    const { data: members, error: membersError } = await supabase
      .from("memberships")
      .select(
        "id, tenant_id, profile_id, roles, invited_by, joined_at, deactivated_at, deleted_at, created_at, updated_at"
      )
      .eq("tenant_id", organizationId)
      .order("joined_at", { ascending: true })
    if (membersError) throw membersError

    const memberRows = (members ?? []) as MembershipRow[]
    const profileIds = memberRows
      .map((m) => m.profile_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)

    if (profileIds.length === 0) {
      return memberRows.map((m) => ({
        ...membershipToOrganizationMember(m),
        profile: null,
      }))
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", profileIds)
    if (profilesError) throw profilesError

    const profileById = new Map(
      (
        (profiles ?? []) as Array<{
          id: string
          email: string | null
          full_name: string | null
        }>
      ).map((p) => [p.id, { ...p, avatar_url: null as string | null }])
    )

    return memberRows.map((m) => ({
      ...membershipToOrganizationMember(m),
      profile: profileById.get(m.profile_id) ?? null,
    }))
  }

  // ─── Subscriptions ────────────────────────────────────────────

  async getCurrentSubscription(organizationId: string): Promise<OrganizationSubscription | null> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("tenant_id", organizationId)
      .eq("is_current", true)
      .maybeSingle<SubscriptionRow>()
    if (error) throw error
    return data ? subscriptionRowToOrganizationSubscription(data) : null
  }

  async upsertSubscription(
    input: UpsertOrganizationSubscription
  ): Promise<OrganizationSubscription> {
    const supabase = await getBillingWriteClient()

    // Strip the TS-shape organization_id, replace with tenant_id for the DB.
    // Resolve plan_id from plan_tier (NOT NULL FK on the new subscriptions table).
    const tenantId = input.organization_id
    const tier: PlanTier = input.plan_tier ?? "standard"
    const planId = await resolvePlanId(supabase, tier)

    const dbBase: Record<string, unknown> = {
      tenant_id: tenantId,
      plan_id: planId,
      plan_tier: tier,
    }
    for (const [key, value] of Object.entries(input)) {
      if (key === "organization_id" || key === "plan_tier") continue
      if (value !== undefined) dbBase[key] = value
    }

    if (input.stripe_subscription_id) {
      const { data: existing, error: lookupError } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("stripe_subscription_id", input.stripe_subscription_id)
        .maybeSingle()
      if (lookupError) throw lookupError

      if (existing) {
        const existingId = (existing as { id: string }).id
        // Demote sibling rows FIRST so the partial unique index
        // (subscriptions_one_current_per_tenant) never sees two
        // is_current=TRUE rows mid-flight.
        await supabase
          .from("subscriptions")
          .update({ is_current: false })
          .eq("tenant_id", tenantId)
          .neq("id", existingId)

        const { data, error } = await supabase
          .from("subscriptions")
          .update({ ...dbBase, is_current: true })
          .eq("id", existingId)
          .select("*")
          .single<SubscriptionRow>()
        if (error) throw error
        return subscriptionRowToOrganizationSubscription(data)
      }
    }

    await supabase
      .from("subscriptions")
      .update({ is_current: false })
      .eq("tenant_id", tenantId)
      .eq("is_current", true)

    const { data, error } = await supabase
      .from("subscriptions")
      .insert({ ...dbBase, is_current: true })
      .select("*")
      .single<SubscriptionRow>()
    if (error) throw error
    return subscriptionRowToOrganizationSubscription(data)
  }

  async updateSubscriptionPlanTierAndSeats(input: {
    subscriptionId: string
    planTier: "standard" | "pro" | "max"
    seatCount: number
  }): Promise<OrganizationSubscription> {
    const supabase = await getBillingWriteClient()
    const planId = await resolvePlanId(supabase, input.planTier)
    const { data, error } = await supabase
      .from("subscriptions")
      .update({ plan_tier: input.planTier, seat_count: input.seatCount, plan_id: planId })
      .eq("id", input.subscriptionId)
      .select("*")
      .single<SubscriptionRow>()
    if (error) throw error
    return subscriptionRowToOrganizationSubscription(data)
  }

  // ─── Invitations ──────────────────────────────────────────────

  /**
   * Pending invitations for an org — the DDD `invitations` table has no
   * `status` column, so "pending" is derived: `accepted_at IS NULL AND
   * revoked_at IS NULL AND expires_at > now()`. Other invitation methods
   * were removed in the DDD migration; the new flow goes through
   * `app/actions/invitations.ts` + the `accept_invitation` RPC.
   */
  async listPendingInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
    const supabase = await getDatabaseClient()
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from("invitations")
      .select(
        "id, tenant_id, email, roles, token, invited_by, expires_at, accepted_at, revoked_at, created_at"
      )
      .eq("tenant_id", organizationId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
    if (error) throw error
    return ((data ?? []) as InvitationRow[]).map(invitationRowToOrganizationInvitation)
  }

  // ─── Seat accounting ──────────────────────────────────────────

  async getSeatUsage(organizationId: string): Promise<OrganizationSeatUsage> {
    const supabase = await getDatabaseClient()
    const nowIso = new Date().toISOString()

    const [subscription, activeMembers, pendingInvites] = await Promise.all([
      this.getCurrentSubscription(organizationId),
      supabase
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", organizationId)
        .is("deleted_at", null),
      supabase
        .from("invitations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", organizationId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", nowIso),
    ])

    if (activeMembers.error) throw activeMembers.error
    if (pendingInvites.error) throw pendingInvites.error

    const purchased = subscription?.seat_count ?? 0
    const active_members = activeMembers.count ?? 0
    const pending_invites = pendingInvites.count ?? 0
    const used = active_members + pending_invites
    const available = Math.max(0, purchased - used)

    return { purchased, active_members, pending_invites, used, available }
  }

  async getMemberRole(organizationId: string, userId: string): Promise<OrganizationRole | null> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("memberships")
      .select("roles")
      .eq("tenant_id", organizationId)
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return rolesArrayToRole((data as { roles: string[] }).roles)
  }

  /**
   * Active-member seat count for the tenant. Counts `memberships` rows
   * with `deleted_at IS NULL`. Pending invites are tracked separately
   * via `invitations` and bill when accepted.
   */
  async countActiveMembers(organizationId: string): Promise<number> {
    const supabase = await getDatabaseClient()
    const { count, error } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", organizationId)
      .is("deleted_at", null)
    if (error) throw error
    return count ?? 0
  }
}

export const organizationService = new OrganizationService()
