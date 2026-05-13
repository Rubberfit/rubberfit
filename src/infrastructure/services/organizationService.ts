import "reflect-metadata"
import { injectable } from "tsyringe"

import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import {
  type AcceptInvitationResult,
  type CreateOrganization,
  type CreateOrganizationInvitation,
  type CreateOrganizationMember,
  type Organization,
  type OrganizationInvitation,
  type OrganizationInvitationPreview,
  type OrganizationMember,
  type OrganizationMemberWithProfile,
  type OrganizationRole,
  type OrganizationSeatUsage,
  type OrganizationSubscription,
  type OrganizationWithSubscription,
  type UpdateOrganization,
  type UpdateOrganizationInvitation,
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

@injectable()
export class OrganizationService implements IOrganizationService {
  // ─── Organization CRUD ──────────────────────────────────────

  async createOrganization(input: CreateOrganization): Promise<Organization> {
    const supabase = await getBillingWriteClient()
    const { data, error } = await supabase.from("organizations").insert(input).select("*").single()
    if (error) throw error
    return data as Organization
  }

  async getOrganizationById(id: string): Promise<Organization | null> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    return (data as Organization | null) ?? null
  }

  async getOrganizationByStripeCustomerId(stripeCustomerId: string): Promise<Organization | null> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle()
    if (error) throw error
    return (data as Organization | null) ?? null
  }

  async updateOrganization(id: string, updates: UpdateOrganization): Promise<Organization> {
    const supabase = await getBillingWriteClient()
    const { data, error } = await supabase
      .from("organizations")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw error
    return data as Organization
  }

  // ─── Membership ──────────────────────────────────────────────

  async getCurrentOrganizationForUser(userId: string): Promise<Organization | null> {
    const supabase = await getDatabaseClient()
    // PR 1's schema enforces UNIQUE(user_id) on organization_members so the
    // happy path returns a single row. The `.limit(1).order(...)` guards a
    // future multi-org world: PGRST116 from `.maybeSingle()` on >1 row would
    // surface as a generic "Billing action failed" toast and we'd rather
    // silently take the earliest joined membership than throw.
    const { data, error } = await supabase
      .from("organization_members")
      .select("organization:organizations(*)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    // Supabase typed the join as Organization | Organization[] depending on
    // cardinality. The FK is single-valued, so the runtime shape is one row.
    const joined = (data as { organization: Organization | Organization[] | null }).organization
    if (Array.isArray(joined)) return joined[0] ?? null
    return joined ?? null
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
    const { data, error } = await supabase
      .from("organization_members")
      .insert(input)
      .select("*")
      .single()
    if (error) throw error
    return data as OrganizationMember
  }

  async updateMember(
    memberId: string,
    updates: UpdateOrganizationMember
  ): Promise<OrganizationMember> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("organization_members")
      .update(updates)
      .eq("id", memberId)
      .select("*")
      .single()
    if (error) throw error
    return data as OrganizationMember
  }

  async deactivateOwnMembership(userId: string): Promise<OrganizationMember> {
    const supabase = makeAdminClient()
    if (!supabase) {
      throw new Error("Supabase service role client is required to leave an organization")
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("id, organization_id, user_id, role, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle()
    if (membershipError) throw membershipError
    if (!membership) throw new Error("Active organization membership not found")

    const member = membership as Pick<
      OrganizationMember,
      "id" | "organization_id" | "user_id" | "role" | "status"
    >
    if (member.user_id !== userId) {
      throw new Error("Cannot leave another user's organization membership")
    }

    if (member.role === "owner") {
      const { count, error: ownerCountError } = await supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", member.organization_id)
        .eq("role", "owner")
        .eq("status", "active")
      if (ownerCountError) throw ownerCountError
      if ((count ?? 0) <= 1) {
        throw new Error("Cannot leave organization as the last owner")
      }
    }

    const { data, error } = await supabase
      .from("organization_members")
      .update({
        status: "deactivated",
        deactivated_at: new Date().toISOString(),
      })
      .eq("id", member.id)
      .eq("user_id", userId)
      .select("*")
      .single()
    if (error) throw error
    return data as OrganizationMember
  }

  async listMembers(organizationId: string): Promise<OrganizationMemberWithProfile[]> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("organization_members")
      .select("*, profile:profiles(id, email, full_name, avatar_url)")
      .eq("organization_id", organizationId)
      .order("joined_at", { ascending: true })
    if (error) throw error
    return (data ?? []) as OrganizationMemberWithProfile[]
  }

  // ─── Subscriptions ──────────────────────────────────────────

  async getCurrentSubscription(organizationId: string): Promise<OrganizationSubscription | null> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("organization_subscriptions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_current", true)
      .maybeSingle()
    if (error) throw error
    return (data as OrganizationSubscription | null) ?? null
  }

  async upsertSubscription(
    input: UpsertOrganizationSubscription
  ): Promise<OrganizationSubscription> {
    const supabase = await getBillingWriteClient()

    // Match-or-insert on stripe_subscription_id when provided; otherwise
    // we treat the call as a new-subscription insert and flip the
    // previous is_current row off.
    if (input.stripe_subscription_id) {
      const { data: existing, error: lookupError } = await supabase
        .from("organization_subscriptions")
        .select("id")
        .eq("stripe_subscription_id", input.stripe_subscription_id)
        .maybeSingle()
      if (lookupError) throw lookupError

      if (existing) {
        // Demote sibling rows FIRST so the partial unique index
        // (organization_subscriptions_one_current) never sees two
        // is_current=TRUE rows mid-flight. The matched row is then
        // safe to flip to is_current=TRUE in the second statement.
        // The full atomic version is a Postgres function called via
        // .rpc(); this two-step approach is acceptable because
        // stripe_events dedupe serializes webhook delivery upstream.
        const existingId = (existing as { id: string }).id
        await supabase
          .from("organization_subscriptions")
          .update({ is_current: false })
          .eq("organization_id", input.organization_id)
          .neq("id", existingId)

        const { data, error } = await supabase
          .from("organization_subscriptions")
          .update({ ...input, is_current: true })
          .eq("id", existingId)
          .select("*")
          .single()
        if (error) throw error
        return data as OrganizationSubscription
      }
    }

    // No match — insert a new row and demote any previous current rows.
    await supabase
      .from("organization_subscriptions")
      .update({ is_current: false })
      .eq("organization_id", input.organization_id)
      .eq("is_current", true)

    const { data, error } = await supabase
      .from("organization_subscriptions")
      .insert({ ...input, is_current: true })
      .select("*")
      .single()
    if (error) throw error
    return data as OrganizationSubscription
  }

  // ─── Invitations ────────────────────────────────────────────

  async createInvitation(input: CreateOrganizationInvitation): Promise<OrganizationInvitation> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("organization_invitations")
      .insert(input)
      .select("*")
      .single()
    if (error) throw error
    return data as OrganizationInvitation
  }

  async getInvitationByToken(token: string): Promise<OrganizationInvitation | null> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("organization_invitations")
      .select("*")
      .eq("token", token)
      .maybeSingle()
    if (error) throw error
    return (data as OrganizationInvitation | null) ?? null
  }

  async getInvitationById(invitationId: string): Promise<OrganizationInvitation | null> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("organization_invitations")
      .select("*")
      .eq("id", invitationId)
      .maybeSingle()
    if (error) throw error
    return (data as OrganizationInvitation | null) ?? null
  }

  async getInvitationPreviewByToken(token: string): Promise<OrganizationInvitationPreview | null> {
    // The RPC is SECURITY DEFINER so the request client suffices for the
    // anonymous /invite/[token] case. Authenticated callers go through the
    // same path; no admin-client needed.
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase.rpc("get_invitation_preview_by_token", {
      p_token: token,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : null
    if (!row) return null
    const preview = row as {
      invitation_id: string
      organization_id: string
      organization_name: string
      email: string
      role: "admin" | "member"
      status: OrganizationInvitationPreview["status"]
      expires_at: string
      inviter_name: string | null
    }
    return {
      invitation_id: preview.invitation_id,
      organization_id: preview.organization_id,
      organization_name: preview.organization_name,
      email: preview.email,
      role: preview.role,
      status: preview.status,
      expires_at: preview.expires_at,
      inviter_name: preview.inviter_name,
    }
  }

  async acceptInvitationAtomically(input: {
    token: string
    actorId: string
    actorEmail: string
    acceptedAt: string
  }): Promise<AcceptInvitationResult> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase.rpc("accept_organization_invitation", {
      p_token: input.token,
      p_actor_id: input.actorId,
      p_actor_email: input.actorEmail,
      p_accepted_at: input.acceptedAt,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : null
    if (!row) {
      return { result_code: "not_found" }
    }
    const result = row as {
      result_code: string
      organization_id: string | null
      membership_id: string | null
    }
    if (result.result_code === "ok") {
      if (!result.organization_id || !result.membership_id) {
        throw new Error("accept_organization_invitation returned ok without ids")
      }
      return {
        result_code: "ok",
        organization_id: result.organization_id,
        membership_id: result.membership_id,
      }
    }
    const knownCodes = [
      "not_found",
      "already_accepted",
      "revoked",
      "expired",
      "email_mismatch",
      "org_subscription_inactive",
      "membership_exists",
    ] as const
    type KnownCode = (typeof knownCodes)[number]
    if (!(knownCodes as readonly string[]).includes(result.result_code)) {
      throw new Error(
        `accept_organization_invitation returned unknown result_code: ${result.result_code}`
      )
    }
    return { result_code: result.result_code as KnownCode }
  }

  async updateInvitation(
    invitationId: string,
    updates: UpdateOrganizationInvitation
  ): Promise<OrganizationInvitation> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("organization_invitations")
      .update(updates)
      .eq("id", invitationId)
      .select("*")
      .single()
    if (error) throw error
    return data as OrganizationInvitation
  }

  async listPendingInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("organization_invitations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []) as OrganizationInvitation[]
  }

  // ─── Seat accounting ────────────────────────────────────────

  async getSeatUsage(organizationId: string): Promise<OrganizationSeatUsage> {
    const supabase = await getDatabaseClient()

    const [subscription, activeMembers, pendingInvites] = await Promise.all([
      this.getCurrentSubscription(organizationId),
      supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("organization_invitations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "pending"),
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
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return (data as { role: OrganizationRole }).role
  }
}

export const organizationService = new OrganizationService()
