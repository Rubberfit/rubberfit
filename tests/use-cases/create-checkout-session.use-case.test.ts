import { beforeEach, describe, expect, it, vi } from "vitest"
import type Stripe from "stripe"

import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type {
  IStripeClientService,
  StripeBillingClient,
} from "@/src/application/services/stripe-client.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import {
  CreateCheckoutSessionUseCase,
  type ICreateCheckoutSessionUseCase,
} from "@/src/application/use-cases/billing/create-checkout-session.use-case"
import type {
  CreateOrganization,
  CreateOrganizationInvitation,
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
  UpdateOrganizationInvitation,
  UpsertOrganizationSubscription,
} from "@/src/infrastructure/models/billing"

const ORG_ID = "00000000-0000-4000-8000-000000000001"
const ACTOR_ID = "00000000-0000-4000-8000-000000000002"
const CUSTOMER_ID = "cus_existing_123"
const CREATED_CUSTOMER_ID = "cus_created_123"
const PRICE_ID = "price_pro_annual"
const SESSION_URL = "https://checkout.stripe.com/c/pay/cs_test_123"

const ACTOR: ActionActor = {
  id: ACTOR_ID,
  email: "owner@acme.example",
  roles: ["manager"],
  isSuperAdmin: false,
}

function makeOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: ORG_ID,
    name: "Acme Rubber",
    billing_email: "billing@acme.example",
    stripe_customer_id: CUSTOMER_ID,
    created_by: ACTOR_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeSubscription(
  overrides: Partial<OrganizationSubscription> = {}
): OrganizationSubscription {
  return {
    id: "00000000-0000-4000-8000-000000000003",
    organization_id: ORG_ID,
    stripe_subscription_id: null,
    stripe_subscription_item_id: null,
    stripe_price_id: null,
    stripe_product_id: null,
    latest_invoice_id: null,
    plan_tier: "pro",
    billing_interval: null,
    seat_count: 3,
    status: "incomplete",
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

class FakeOrganizationService implements IOrganizationService {
  organization: Organization | null = makeOrganization()
  subscription: OrganizationSubscription | null = makeSubscription()
  role: OrganizationRole | null = "owner"
  updates: Array<{ id: string; updates: UpdateOrganization }> = []

  async createOrganization(input: CreateOrganization): Promise<Organization> {
    const org = makeOrganization({
      name: input.name,
      billing_email: input.billing_email,
      created_by: input.created_by,
    })
    this.organization = org
    return org
  }

  async getOrganizationById(id: string): Promise<Organization | null> {
    if (this.organization?.id !== id) return null
    return this.organization
  }

  async getOrganizationByStripeCustomerId(): Promise<Organization | null> {
    return null
  }

  async updateOrganization(id: string, updates: UpdateOrganization): Promise<Organization> {
    if (!this.organization || this.organization.id !== id) throw new Error("org not found")
    this.updates.push({ id, updates })
    this.organization = {
      ...this.organization,
      ...updates,
      updated_at: new Date().toISOString(),
    }
    return this.organization
  }

  async getCurrentOrganizationForUser(): Promise<Organization | null> {
    return this.organization
  }

  async getCurrentOrganizationWithSubscription(): Promise<OrganizationWithSubscription | null> {
    if (!this.organization) return null
    return { ...this.organization, current_subscription: this.subscription }
  }

  async addMember(input: CreateOrganizationMember): Promise<OrganizationMember> {
    return {
      id: "00000000-0000-4000-8000-000000000004",
      organization_id: input.organization_id,
      user_id: input.user_id,
      role: input.role,
      status: input.status ?? "active",
      invited_by: input.invited_by ?? null,
      joined_at: input.joined_at ?? new Date().toISOString(),
      deactivated_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  async updateMember(): Promise<OrganizationMember> {
    throw new Error("not used")
  }

  async deactivateOwnMembership(): Promise<OrganizationMember> {
    throw new Error("not used")
  }

  async listMembers(): Promise<OrganizationMemberWithProfile[]> {
    return []
  }

  async getCurrentSubscription(): Promise<OrganizationSubscription | null> {
    return this.subscription
  }

  async upsertSubscription(
    input: UpsertOrganizationSubscription
  ): Promise<OrganizationSubscription> {
    const subscription = makeSubscription({
      organization_id: input.organization_id,
      stripe_subscription_id: input.stripe_subscription_id ?? null,
      stripe_subscription_item_id: input.stripe_subscription_item_id ?? null,
      stripe_price_id: input.stripe_price_id ?? null,
      stripe_product_id: input.stripe_product_id ?? null,
      latest_invoice_id: input.latest_invoice_id ?? null,
      plan_tier: input.plan_tier ?? "standard",
      billing_interval: input.billing_interval ?? null,
      seat_count: input.seat_count ?? 1,
      status: input.status ?? "incomplete",
      is_current: input.is_current ?? true,
    })
    this.subscription = subscription
    return subscription
  }

  async updateSubscriptionPlanTierAndSeats(): Promise<OrganizationSubscription> {
    throw new Error("not used")
  }

  async createInvitation(input: CreateOrganizationInvitation): Promise<OrganizationInvitation> {
    return {
      id: "00000000-0000-4000-8000-000000000005",
      organization_id: input.organization_id,
      email: input.email,
      role: input.role,
      status: "pending",
      token: input.token,
      invited_by: input.invited_by,
      expires_at: input.expires_at ?? new Date().toISOString(),
      accepted_at: null,
      revoked_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  async getInvitationByToken(): Promise<OrganizationInvitation | null> {
    return null
  }

  async updateInvitation(
    invitationId: string,
    updates: UpdateOrganizationInvitation
  ): Promise<OrganizationInvitation> {
    return {
      id: invitationId,
      organization_id: ORG_ID,
      email: "invitee@acme.example",
      role: "member",
      status: updates.status ?? "pending",
      token: "token",
      invited_by: ACTOR_ID,
      expires_at: new Date().toISOString(),
      accepted_at: updates.accepted_at ?? null,
      revoked_at: updates.revoked_at ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  async listPendingInvitations(): Promise<OrganizationInvitation[]> {
    return []
  }

  async getSeatUsage(): Promise<OrganizationSeatUsage> {
    return {
      purchased: this.subscription?.seat_count ?? 0,
      active_members: 1,
      pending_invites: 0,
      used: 1,
      available: Math.max(0, (this.subscription?.seat_count ?? 0) - 1),
    }
  }

  async getMemberRole(): Promise<OrganizationRole | null> {
    return this.role
  }

  async getInvitationById() {
    return null
  }
  async getInvitationPreviewByToken() {
    return null
  }
  async acceptInvitationAtomically() {
    return { result_code: "not_found" as const }
  }
}

function makeStripeClient(
  overrides: {
    createCustomer?: StripeBillingClient["customers"]["create"]
    createSession?: StripeBillingClient["checkout"]["sessions"]["create"]
    listPrices?: StripeBillingClient["prices"]["list"]
  } = {}
) {
  const listPrices = vi.fn(async (params: Stripe.PriceListParams) => {
    if (overrides.listPrices) return overrides.listPrices(params)
    return {
      data: [{ id: PRICE_ID }],
    }
  })
  const createCustomer = vi.fn(async (params: Stripe.CustomerCreateParams) => {
    if (overrides.createCustomer) return overrides.createCustomer(params)
    return {
      id: CREATED_CUSTOMER_ID,
    }
  })
  const createSession = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
    if (overrides.createSession) return overrides.createSession(params)
    return {
      url: SESSION_URL,
    }
  })

  const updateSubscription = vi.fn(
    async (_id: string, _params: Stripe.SubscriptionUpdateParams) => ({
      id: "sub_test",
      status: "active" as const,
    })
  )

  const createPortalSession = vi.fn(async (_params: Stripe.BillingPortal.SessionCreateParams) => ({
    url: "https://billing.stripe.com/test",
  }))

  const client: StripeBillingClient = {
    prices: { list: listPrices },
    customers: { create: createCustomer },
    checkout: { sessions: { create: createSession } },
    subscriptions: { update: updateSubscription },
    billingPortal: { sessions: { create: createPortalSession } },
  }
  const service: IStripeClientService = { getClient: () => client }

  return {
    service,
    listPrices,
    createCustomer,
    createSession,
    updateSubscription,
    createPortalSession,
  }
}

describe("CreateCheckoutSessionUseCase", () => {
  let organizationService: FakeOrganizationService
  let stripe: ReturnType<typeof makeStripeClient>
  let useCase: ICreateCheckoutSessionUseCase

  beforeEach(() => {
    organizationService = new FakeOrganizationService()
    stripe = makeStripeClient()
    useCase = new CreateCheckoutSessionUseCase(organizationService, stripe.service)
  })

  it("returns the Checkout Session URL on the happy path", async () => {
    const result = await useCase.execute({
      organizationId: ORG_ID,
      billingInterval: "annual",
      actor: ACTOR,
    })

    expect(result).toEqual({ url: SESSION_URL })
    expect(stripe.createCustomer).not.toHaveBeenCalled()
    expect(stripe.listPrices).toHaveBeenCalledWith({
      lookup_keys: ["rubberfit.pro.annual.v1"],
      active: true,
      limit: 1,
    })
  })

  it("fails when the caller is not an organization owner or admin", async () => {
    organizationService.role = "member"

    await expect(
      useCase.execute({
        organizationId: ORG_ID,
        billingInterval: "annual",
        actor: ACTOR,
      })
    ).rejects.toThrow("Only organization owners and admins can start checkout")
    expect(stripe.createSession).not.toHaveBeenCalled()
  })

  it("fails when pre-creating a missing Stripe Customer fails", async () => {
    organizationService.organization = makeOrganization({ stripe_customer_id: null })
    const createCustomer = vi.fn(async (_params: Stripe.CustomerCreateParams) => {
      throw new Error("customer create failed")
    })
    stripe = makeStripeClient({ createCustomer })
    useCase = new CreateCheckoutSessionUseCase(organizationService, stripe.service)

    await expect(
      useCase.execute({
        organizationId: ORG_ID,
        billingInterval: "annual",
        actor: ACTOR,
      })
    ).rejects.toThrow("customer create failed")
    expect(stripe.createSession).not.toHaveBeenCalled()
  })

  it("passes the required metadata and tax fields to Stripe Checkout", async () => {
    await useCase.execute({
      organizationId: ORG_ID,
      billingInterval: "annual",
      actor: ACTOR,
    })

    const params = stripe.createSession.mock.calls[0]?.[0]
    if (!params) throw new Error("Checkout Session params missing")

    const metadata = {
      product: "rubberfit",
      organization_id: ORG_ID,
      plan_tier: "pro",
      billing_interval: "annual",
    }
    expect(params).toMatchObject({
      mode: "subscription",
      ui_mode: "hosted_page",
      payment_method_collection: "always",
      billing_address_collection: "required",
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      customer: CUSTOMER_ID,
      customer_update: { address: "auto", name: "auto" },
      line_items: [{ price: PRICE_ID, quantity: 3 }],
      subscription_data: {
        trial_period_days: 14,
        metadata,
      },
      metadata,
      success_url: "https://get.rubberfit.app/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://get.rubberfit.app/checkout/cancel",
    })
    expect("payment_method_types" in params).toBe(false)
    expect("allow_promotion_codes" in params).toBe(false)
    expect("discounts" in params).toBe(false)
  })
})
