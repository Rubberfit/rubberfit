import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type Stripe from "stripe"

import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type {
  IStripeClientService,
  StripeBillingClient,
} from "@/src/application/services/stripe-client.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import {
  CreateBillingPortalSessionUseCase,
  type ICreateBillingPortalSessionUseCase,
} from "@/src/application/use-cases/billing/create-billing-portal-session.use-case"
import type {
  Organization,
  OrganizationRole,
  OrganizationSubscription,
} from "@/src/infrastructure/models/billing"

const ORG_ID = "00000000-0000-4000-8000-000000000001"
const ACTOR_ID = "00000000-0000-4000-8000-000000000002"
const CUSTOMER_ID = "cus_existing_123"
const PORTAL_URL = "https://billing.stripe.com/p/session/test_123"
const CONFIG_ID = "bpc_1TWh902OM4DE2aIIyE4cpiOG"

const ACTOR: ActionActor = {
  id: ACTOR_ID,
  email: "owner@acme.example",
  roles: ["manager"],
  isSuperAdmin: false,
  activeTenantId: null,
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
    stripe_subscription_id: "sub_test_123",
    stripe_subscription_item_id: "si_test_123",
    stripe_price_id: "price_pro_annual",
    stripe_product_id: "rubberfit_pro",
    latest_invoice_id: null,
    plan_tier: "pro",
    billing_interval: "annual",
    seat_count: 3,
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

interface PortalFake {
  service: IOrganizationService
  setRole(role: OrganizationRole | null): void
  setOrganization(org: Organization | null): void
  setSubscription(sub: OrganizationSubscription | null): void
}

function makeOrganizationFake(): PortalFake {
  let role: OrganizationRole | null = "owner"
  let organization: Organization | null = makeOrganization()
  let subscription: OrganizationSubscription | null = makeSubscription()

  const service: IOrganizationService = {
    async getMemberRole() {
      return role
    },
    async getOrganizationById(id: string) {
      if (organization?.id !== id) return null
      return organization
    },
    async getCurrentSubscription() {
      return subscription
    },
    async createOrganization() {
      throw new Error("not used")
    },
    async getOrganizationByStripeCustomerId() {
      throw new Error("not used")
    },
    async updateOrganization() {
      throw new Error("not used")
    },
    async getCurrentOrganizationForUser() {
      throw new Error("not used")
    },
    async getCurrentOrganizationWithSubscription() {
      throw new Error("not used")
    },
    async addMember() {
      throw new Error("not used")
    },
    async updateMember() {
      throw new Error("not used")
    },
    async deactivateOwnMembership() {
      throw new Error("not used")
    },
    async listMembers() {
      throw new Error("not used")
    },
    async upsertSubscription() {
      throw new Error("not used")
    },
    async updateSubscriptionPlanTierAndSeats() {
      throw new Error("not used")
    },
    async createInvitation() {
      throw new Error("not used")
    },
    async getInvitationByToken() {
      throw new Error("not used")
    },
    async getInvitationById() {
      throw new Error("not used")
    },
    async getInvitationPreviewByToken() {
      throw new Error("not used")
    },
    async updateInvitation() {
      throw new Error("not used")
    },
    async listPendingInvitations() {
      throw new Error("not used")
    },
    async acceptInvitationAtomically() {
      throw new Error("not used")
    },
    async getSeatUsage() {
      throw new Error("not used")
    },
  }

  return {
    service,
    setRole(value) {
      role = value
    },
    setOrganization(value) {
      organization = value
    },
    setSubscription(value) {
      subscription = value
    },
  }
}

function makeStripeFake(
  overrides: {
    createPortalSession?: StripeBillingClient["billingPortal"]["sessions"]["create"]
  } = {}
) {
  const createPortalSession = vi.fn(async (params: Stripe.BillingPortal.SessionCreateParams) => {
    if (overrides.createPortalSession) return overrides.createPortalSession(params)
    return { url: PORTAL_URL }
  })

  const client: StripeBillingClient = {
    prices: { list: vi.fn(async () => ({ data: [] })) },
    customers: { create: vi.fn(async () => ({ id: "cus_unused" })) },
    checkout: { sessions: { create: vi.fn(async () => ({ url: "https://example.invalid" })) } },
    subscriptions: {
      update: vi.fn(async () => ({ id: "sub_unused", status: "active" as const })),
    },
    billingPortal: { sessions: { create: createPortalSession } },
  }
  const service: IStripeClientService = { getClient: () => client }
  return { service, createPortalSession }
}

describe("CreateBillingPortalSessionUseCase", () => {
  let fake: PortalFake
  let stripe: ReturnType<typeof makeStripeFake>
  let useCase: ICreateBillingPortalSessionUseCase

  const ORIGINAL_APP_URL = process.env.APP_URL
  const ORIGINAL_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL
  const ORIGINAL_PORTAL_CONFIG = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID

  beforeEach(() => {
    fake = makeOrganizationFake()
    stripe = makeStripeFake()
    useCase = new CreateBillingPortalSessionUseCase(fake.service, stripe.service)
    process.env.APP_URL = "https://rubberfit.app"
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID
  })

  afterEach(() => {
    process.env.APP_URL = ORIGINAL_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_PUBLIC_APP_URL
    process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID = ORIGINAL_PORTAL_CONFIG
  })

  it("returns a Portal URL on the happy path", async () => {
    const result = await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    expect(result).toEqual({ url: PORTAL_URL })
    expect(stripe.createPortalSession).toHaveBeenCalledWith({
      customer: CUSTOMER_ID,
      return_url: "https://rubberfit.app/dashboard/settings/billing",
    })
  })

  it("passes a custom returnPath through to Stripe", async () => {
    await useCase.execute({
      organizationId: ORG_ID,
      returnPath: "/dashboard/settings/team",
      actor: ACTOR,
    })

    const params = stripe.createPortalSession.mock.calls[0]?.[0]
    expect(params?.return_url).toBe("https://rubberfit.app/dashboard/settings/team")
  })

  it("passes the portal configuration when STRIPE_BILLING_PORTAL_CONFIGURATION_ID is set", async () => {
    process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID = CONFIG_ID

    await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    const params = stripe.createPortalSession.mock.calls[0]?.[0]
    expect(params?.configuration).toBe(CONFIG_ID)
  })

  it("omits the configuration when the env var is unset", async () => {
    await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    const params = stripe.createPortalSession.mock.calls[0]?.[0]
    expect(params && "configuration" in params).toBe(false)
  })

  it.each(["past_due", "unpaid"] as const)(
    "allows %s subscriptions to open the Portal — the lock screen's update_billing recovery routes here",
    async (status) => {
      fake.setSubscription(makeSubscription({ status }))

      const result = await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

      expect(result).toEqual({ url: PORTAL_URL })
    }
  )

  it("returns forbidden when the caller is a member", async () => {
    fake.setRole("member")

    const result = await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    expect(result).toEqual({ error: "forbidden" })
    expect(stripe.createPortalSession).not.toHaveBeenCalled()
  })

  it("returns forbidden when the caller is not a member at all", async () => {
    fake.setRole(null)

    const result = await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    expect(result).toEqual({ error: "forbidden" })
  })

  it("returns organization_not_found when no org row exists", async () => {
    fake.setOrganization(null)

    const result = await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    expect(result).toEqual({ error: "organization_not_found" })
    expect(stripe.createPortalSession).not.toHaveBeenCalled()
  })

  it("returns subscription_not_found when the org has no subscription row", async () => {
    fake.setSubscription(null)

    const result = await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    expect(result).toEqual({ error: "subscription_not_found" })
  })

  it("returns enterprise_account for enterprise tier regardless of status", async () => {
    fake.setSubscription(makeSubscription({ plan_tier: "enterprise" }))

    const result = await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    expect(result).toEqual({ error: "enterprise_account" })
    expect(stripe.createPortalSession).not.toHaveBeenCalled()
  })

  it.each(["incomplete", "incomplete_expired"] as const)(
    "returns checkout_required for status=%s",
    async (status) => {
      fake.setSubscription(makeSubscription({ status }))

      const result = await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

      expect(result).toEqual({ error: "checkout_required" })
      expect(stripe.createPortalSession).not.toHaveBeenCalled()
    }
  )

  it.each(["canceled", "paused"] as const)(
    "returns restart_subscription for status=%s",
    async (status) => {
      fake.setSubscription(makeSubscription({ status }))

      const result = await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

      expect(result).toEqual({ error: "restart_subscription" })
      expect(stripe.createPortalSession).not.toHaveBeenCalled()
    }
  )

  it("returns stripe_customer_missing when the org has no Stripe customer id", async () => {
    fake.setOrganization(makeOrganization({ stripe_customer_id: null }))

    const result = await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    expect(result).toEqual({ error: "stripe_customer_missing" })
    expect(stripe.createPortalSession).not.toHaveBeenCalled()
  })

  it("returns stripe_portal_unavailable when Stripe throws", async () => {
    stripe = makeStripeFake({
      createPortalSession: vi.fn(async () => {
        throw new Error("rate limited")
      }),
    })
    useCase = new CreateBillingPortalSessionUseCase(fake.service, stripe.service)

    const result = await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    expect(result).toEqual({ error: "stripe_portal_unavailable" })
  })

  it("returns stripe_portal_unavailable when Stripe returns no URL", async () => {
    stripe = makeStripeFake({
      createPortalSession: vi.fn(async () => ({ url: "" })),
    })
    useCase = new CreateBillingPortalSessionUseCase(fake.service, stripe.service)

    const result = await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    expect(result).toEqual({ error: "stripe_portal_unavailable" })
  })

  it.each([
    ["absolute URL", "https://evil.example/dashboard"],
    ["protocol-relative", "//evil.example/dashboard"],
    ["backslash form", "/dashboard\\..\\evil"],
    ["bare path without slash", "dashboard/settings/billing"],
    ["http scheme", "http://localhost/dashboard"],
  ])("rejects invalid returnPath: %s", async (_label, returnPath) => {
    const result = await useCase.execute({
      organizationId: ORG_ID,
      returnPath,
      actor: ACTOR,
    })

    expect(result).toEqual({ error: "invalid_return_path" })
    expect(stripe.createPortalSession).not.toHaveBeenCalled()
  })

  it("treats undefined returnPath as the default /dashboard/settings/billing", async () => {
    await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    const params = stripe.createPortalSession.mock.calls[0]?.[0]
    expect(params?.return_url).toBe("https://rubberfit.app/dashboard/settings/billing")
  })

  it("treats an empty-string returnPath as the default", async () => {
    await useCase.execute({ organizationId: ORG_ID, returnPath: "  ", actor: ACTOR })

    const params = stripe.createPortalSession.mock.calls[0]?.[0]
    expect(params?.return_url).toBe("https://rubberfit.app/dashboard/settings/billing")
  })

  it("falls back to NEXT_PUBLIC_APP_URL when APP_URL is unset", async () => {
    delete process.env.APP_URL
    process.env.NEXT_PUBLIC_APP_URL = "https://app.preview.example.com"

    await useCase.execute({ organizationId: ORG_ID, actor: ACTOR })

    const params = stripe.createPortalSession.mock.calls[0]?.[0]
    expect(params?.return_url).toBe("https://app.preview.example.com/dashboard/settings/billing")
  })
})
