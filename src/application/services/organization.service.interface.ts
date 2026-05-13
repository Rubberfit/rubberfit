import type {
  AcceptInvitationResult,
  CreateOrganization,
  CreateOrganizationInvitation,
  CreateOrganizationMember,
  Organization,
  OrganizationInvitation,
  OrganizationInvitationPreview,
  OrganizationMember,
  OrganizationMemberWithProfile,
  OrganizationRole,
  OrganizationSeatUsage,
  OrganizationSubscription,
  OrganizationWithSubscription,
  UpdateOrganization,
  UpdateOrganizationInvitation,
  UpdateOrganizationMember,
  UpsertOrganizationSubscription,
} from "@/src/infrastructure/models/billing"

/**
 * IOrganizationService — billing-tenant CRUD + lookups.
 *
 * Scope for PR 1: surface every read path the gate/onboarding/invite
 * code will need across PRs 4–6, plus a write API that the upcoming
 * Stripe webhook handler can call. Each method is intentionally
 * focused — orchestration (create-org + first-member + Checkout-session)
 * lives in a use-case, not here.
 */
export interface IOrganizationService {
  // ─── Organization CRUD ──────────────────────────────────────
  createOrganization(input: CreateOrganization): Promise<Organization>
  getOrganizationById(id: string): Promise<Organization | null>
  getOrganizationByStripeCustomerId(stripeCustomerId: string): Promise<Organization | null>
  updateOrganization(id: string, updates: UpdateOrganization): Promise<Organization>

  // ─── Membership ──────────────────────────────────────────────
  /**
   * The current org for a given auth user (v1 = one org per user).
   * Returns null if the user belongs to no org yet.
   */
  getCurrentOrganizationForUser(userId: string): Promise<Organization | null>

  /** Org + its is_current=TRUE subscription row. The primary gate-read shape. */
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
   * never had a subscription. Webhook handlers should NOT call this
   * before writing — they upsert directly by stripe_subscription_id.
   */
  getCurrentSubscription(organizationId: string): Promise<OrganizationSubscription | null>

  /**
   * Webhook-side upsert. Idempotent on stripe_subscription_id when
   * provided; otherwise creates a new row. Flipping is_current is
   * handled inside the implementation so external callers can't
   * accidentally leave two current rows.
   */
  upsertSubscription(input: UpsertOrganizationSubscription): Promise<OrganizationSubscription>

  // ─── Invitations ────────────────────────────────────────────
  createInvitation(input: CreateOrganizationInvitation): Promise<OrganizationInvitation>
  getInvitationByToken(token: string): Promise<OrganizationInvitation | null>
  getInvitationById(invitationId: string): Promise<OrganizationInvitation | null>
  /**
   * Public preview backed by the `get_invitation_preview_by_token` SECURITY
   * DEFINER RPC. Anonymous + authenticated callers may resolve this so the
   * `/invite/[token]` landing page can render before sign-in.
   */
  getInvitationPreviewByToken(token: string): Promise<OrganizationInvitationPreview | null>
  updateInvitation(
    invitationId: string,
    updates: UpdateOrganizationInvitation
  ): Promise<OrganizationInvitation>
  listPendingInvitations(organizationId: string): Promise<OrganizationInvitation[]>
  /**
   * Wraps the `accept_organization_invitation` SECURITY DEFINER RPC. The
   * function locks the invite row, validates state + email match + active
   * org subscription, inserts the member, and marks the invite accepted —
   * all inside a single transaction. Sequential calls to addMember +
   * updateInvitation cannot give us the same atomicity under invitee RLS.
   */
  acceptInvitationAtomically(input: {
    token: string
    actorId: string
    actorEmail: string
    acceptedAt: string
  }): Promise<AcceptInvitationResult>

  // ─── Seat accounting ────────────────────────────────────────
  /**
   * Active members + pending invites both count toward `used`. Helper
   * for PR 6 invite gating and the Billing/Team UI counters.
   */
  getSeatUsage(organizationId: string): Promise<OrganizationSeatUsage>

  /**
   * Tenant role for a user inside an org, or null if not a member.
   * Used by PR 5's `requireOrgRole(actor, "admin")` style helpers.
   */
  getMemberRole(organizationId: string, userId: string): Promise<OrganizationRole | null>
}
