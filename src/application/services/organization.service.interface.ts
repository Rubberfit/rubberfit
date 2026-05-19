import type {
  CreateOrganization,
  CreateOrganizationMember,
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationMemberWithProfile,
  OrganizationRole,
  OrganizationSeatUsage,
  OrganizationSubscription,
  OrganizationWithSubscription,
  UpdateOrganization,
  UpdateOrganizationMember,
  UpsertOrganizationSubscription,
} from "@/src/infrastructure/models/billing"

/**
 * IOrganizationService — tenant CRUD + lookups.
 *
 * The DDD migration moved the DB to tenants/memberships/subscriptions; this
 * interface retains the Organization* TS surface for caller stability. The
 * invitation lifecycle (create/get/accept/update) moved to the use-cases
 * under `src/application/use-cases/invitations/`; only `listPendingInvitations`
 * remains here because the team-settings page calls it directly.
 */
export interface IOrganizationService {
  // ─── Organization (tenant) CRUD ────────────────────────────────
  createOrganization(input: CreateOrganization): Promise<Organization>
  getOrganizationById(id: string): Promise<Organization | null>
  getOrganizationByStripeCustomerId(stripeCustomerId: string): Promise<Organization | null>
  updateOrganization(id: string, updates: UpdateOrganization): Promise<Organization>

  // ─── Membership ──────────────────────────────────────────────
  /**
   * The current org for a given auth user. Returns null if the user has
   * no active membership yet.
   */
  getCurrentOrganizationForUser(userId: string): Promise<Organization | null>

  /** Org + its is_current=TRUE subscription row. */
  getCurrentOrganizationWithSubscription(
    userId: string
  ): Promise<OrganizationWithSubscription | null>

  addMember(input: CreateOrganizationMember): Promise<OrganizationMember>
  updateMember(memberId: string, updates: UpdateOrganizationMember): Promise<OrganizationMember>
  deactivateOwnMembership(userId: string): Promise<OrganizationMember>
  listMembers(organizationId: string): Promise<OrganizationMemberWithProfile[]>

  // ─── Subscriptions ──────────────────────────────────────────
  /**
   * Returns the row where is_current = TRUE, or null if the org has
   * never had a subscription.
   */
  getCurrentSubscription(organizationId: string): Promise<OrganizationSubscription | null>

  /**
   * Webhook-side upsert. Idempotent on stripe_subscription_id when
   * provided. Resolves plan_id from plan_tier internally.
   */
  upsertSubscription(input: UpsertOrganizationSubscription): Promise<OrganizationSubscription>

  /**
   * In-place patch for the pre-checkout tier/seat-count change.
   */
  updateSubscriptionPlanTierAndSeats(input: {
    subscriptionId: string
    planTier: "standard" | "pro" | "max"
    seatCount: number
  }): Promise<OrganizationSubscription>

  // ─── Invitations ────────────────────────────────────────────
  /**
   * Pending invitations for the org. Status is derived from accepted_at /
   * revoked_at / expires_at on the DDD `invitations` table.
   */
  listPendingInvitations(organizationId: string): Promise<OrganizationInvitation[]>

  // ─── Seat accounting ────────────────────────────────────────
  getSeatUsage(organizationId: string): Promise<OrganizationSeatUsage>

  /**
   * Tenant role for a user, or null if not a member. Under the DDD schema
   * memberships.roles is a text[]; the highest role is collapsed to the
   * legacy OrganizationRole enum ('admin' or 'member'). 'owner' is never
   * returned — it was removed from the role CHECK constraint.
   */
  getMemberRole(organizationId: string, userId: string): Promise<OrganizationRole | null>

  /**
   * Active-member count for the tenant (memberships with deleted_at IS NULL).
   * Used by the billing-summary page.
   */
  countActiveMembers(organizationId: string): Promise<number>
}
