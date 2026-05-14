import { vi } from "vitest"

import type { IEmailService } from "@/src/application/services/email.service.interface"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type {
  IStripeClientService,
  StripeBillingClient,
} from "@/src/application/services/stripe-client.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import type {
  AcceptInvitationResult,
  OrganizationInvitation,
  OrganizationInvitationPreview,
  OrganizationMember,
  OrganizationMemberWithProfile,
  OrganizationRole,
  OrganizationSeatUsage,
  OrganizationSubscription,
  OrganizationWithSubscription,
} from "@/src/infrastructure/models/billing"

export const ORG_ID = "00000000-0000-4000-8000-000000000001"
export const ACTOR_ID = "00000000-0000-4000-8000-000000000a01"
export const TARGET_MEMBER_ID = "00000000-0000-4000-8000-000000000a02"
export const TARGET_USER_ID = "00000000-0000-4000-8000-000000000a03"
export const INVITATION_ID = "00000000-0000-4000-8000-000000000b01"

export const ACTOR_OWNER: ActionActor = {
  id: ACTOR_ID,
  email: "owner@example.com",
  roles: ["manager"],
  isSuperAdmin: false,
}

export function makeMember(overrides: Partial<OrganizationMember> = {}): OrganizationMember {
  return {
    id: TARGET_MEMBER_ID,
    organization_id: ORG_ID,
    user_id: TARGET_USER_ID,
    role: "member",
    status: "active",
    invited_by: ACTOR_ID,
    joined_at: "2026-05-10T00:00:00.000Z",
    deactivated_at: null,
    created_at: "2026-05-10T00:00:00.000Z",
    updated_at: "2026-05-10T00:00:00.000Z",
    ...overrides,
  }
}

export function makeMemberWithProfile(
  overrides: Partial<OrganizationMemberWithProfile> = {}
): OrganizationMemberWithProfile {
  return {
    ...makeMember(overrides),
    profile: {
      id: TARGET_USER_ID,
      email: "member@example.com",
      full_name: "Member Person",
      avatar_url: null,
    },
    ...overrides,
  }
}

export function makeInvitation(
  overrides: Partial<OrganizationInvitation> = {}
): OrganizationInvitation {
  return {
    id: INVITATION_ID,
    organization_id: ORG_ID,
    email: "invitee@example.com",
    role: "member",
    status: "pending",
    token: "tok_test_invitation",
    invited_by: ACTOR_ID,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    accepted_at: null,
    revoked_at: null,
    created_at: "2026-05-10T00:00:00.000Z",
    updated_at: "2026-05-10T00:00:00.000Z",
    ...overrides,
  }
}

export function makeSubscription(
  overrides: Partial<OrganizationSubscription> = {}
): OrganizationSubscription {
  return {
    id: "sub-row-1",
    organization_id: ORG_ID,
    stripe_subscription_id: "sub_test_123",
    stripe_subscription_item_id: "si_test_123",
    stripe_price_id: "price_test",
    stripe_product_id: "prod_test",
    latest_invoice_id: null,
    plan_tier: "pro",
    billing_interval: "monthly",
    seat_count: 5,
    status: "active",
    trial_end: null,
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    last_payment_status: null,
    last_stripe_event_id: null,
    last_stripe_event_created_at: null,
    is_current: true,
    created_at: "2026-05-10T00:00:00.000Z",
    updated_at: "2026-05-10T00:00:00.000Z",
    ...overrides,
  }
}

export function makeSeatUsage(
  overrides: Partial<OrganizationSeatUsage> = {}
): OrganizationSeatUsage {
  return {
    purchased: 5,
    active_members: 1,
    pending_invites: 0,
    used: 1,
    available: 4,
    ...overrides,
  }
}

export type FakeOrganizationService = {
  [K in keyof IOrganizationService]: ReturnType<typeof vi.fn<IOrganizationService[K]>>
}

export function makeFakeOrganizationService(
  defaults: Partial<{
    role: OrganizationRole | null
    members: OrganizationMemberWithProfile[]
    pending: OrganizationInvitation[]
    invitation: OrganizationInvitation | null
    subscription: OrganizationSubscription | null
    seatUsage: OrganizationSeatUsage
    acceptResult: AcceptInvitationResult
    preview: OrganizationInvitationPreview | null
    organizationName: string
  }> = {}
): FakeOrganizationService {
  const role = defaults.role ?? "owner"
  const members = defaults.members ?? []
  const pending = defaults.pending ?? []
  const invitation = defaults.invitation ?? null
  const subscription = defaults.subscription ?? null
  const seatUsage = defaults.seatUsage ?? makeSeatUsage()
  const preview = defaults.preview ?? null
  const acceptResult: AcceptInvitationResult =
    defaults.acceptResult ?? ({ result_code: "not_found" } as AcceptInvitationResult)
  const orgName = defaults.organizationName ?? "Acme"

  const fake: FakeOrganizationService = {
    createOrganization: vi.fn(),
    getOrganizationById: vi.fn(async () => ({
      id: ORG_ID,
      name: orgName,
      billing_email: null,
      stripe_customer_id: null,
      created_by: null,
      created_at: "2026-05-10T00:00:00.000Z",
      updated_at: "2026-05-10T00:00:00.000Z",
    })),
    getOrganizationByStripeCustomerId: vi.fn(async () => null),
    updateOrganization: vi.fn(),
    getCurrentOrganizationForUser: vi.fn(async () => null),
    getCurrentOrganizationWithSubscription: vi.fn(
      async () => null as OrganizationWithSubscription | null
    ),
    addMember: vi.fn(),
    updateMember: vi.fn(async (id, _updates) => makeMember({ id })),
    deactivateOwnMembership: vi.fn(),
    listMembers: vi.fn(async () => members),
    getCurrentSubscription: vi.fn(async () => subscription),
    upsertSubscription: vi.fn(
      async () => subscription ?? makeSubscription({ seat_count: seatUsage.purchased })
    ),
    createInvitation: vi.fn(async (input) =>
      makeInvitation({
        organization_id: input.organization_id,
        email: input.email,
        role: input.role,
        token: input.token,
        invited_by: input.invited_by,
        expires_at: input.expires_at ?? makeInvitation().expires_at,
      })
    ),
    getInvitationByToken: vi.fn(async () => invitation),
    getInvitationById: vi.fn(async () => invitation),
    getInvitationPreviewByToken: vi.fn(async () => preview),
    updateInvitation: vi.fn(async (id, _updates) => invitation ?? makeInvitation({ id })),
    listPendingInvitations: vi.fn(async () => pending),
    acceptInvitationAtomically: vi.fn(async () => acceptResult),
    getSeatUsage: vi.fn(async () => seatUsage),
    getMemberRole: vi.fn(async () => role),
  } as unknown as FakeOrganizationService

  return fake
}

export function makeFakeEmailService(overrides: Partial<IEmailService> = {}): IEmailService {
  const successful = { success: true as const, messageId: "msg_test" }
  return {
    sendEmail: vi.fn(async () => successful),
    sendLowStockAlert: vi.fn(async () => successful),
    sendPriceChangeAlert: vi.fn(async () => successful),
    sendPOApprovalRequest: vi.fn(async () => successful),
    sendPOStatusUpdate: vi.fn(async () => successful),
    sendDailyDigest: vi.fn(async () => successful),
    sendWelcomeEmail: vi.fn(async () => successful),
    sendInvitationEmail: vi.fn(async () => successful),
    queueEmail: vi.fn(async () => undefined),
    processEmailQueue: vi.fn(async () => undefined),
    sendBulkEmails: vi.fn(async () => undefined),
    ...overrides,
  }
}

export function makeFakeStripeClient(): {
  service: IStripeClientService
  updateSubscription: ReturnType<typeof vi.fn>
} {
  const updateSubscription = vi.fn(async () => ({
    id: "sub_test_123",
    status: "active" as const,
  }))
  const client: StripeBillingClient = {
    prices: { list: vi.fn(async () => ({ data: [] })) },
    customers: { create: vi.fn(async () => ({ id: "cus_test" })) },
    checkout: { sessions: { create: vi.fn(async () => ({ url: "https://example.invalid" })) } },
    subscriptions: { update: updateSubscription },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: "https://billing.stripe.com/test" })),
      },
    },
  }
  return {
    service: { getClient: () => client },
    updateSubscription,
  }
}
