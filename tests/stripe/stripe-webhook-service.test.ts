/**
 * Unit tests for `StripeWebhookService.handleEvent`.
 *
 * Exercises the service in isolation against a fake IOrganizationService,
 * asserting:
 *   - Unknown event types are `skipped`.
 *   - `customer.subscription.created` / `.updated` produce an upsert
 *     payload with status, plan tier, billing interval, seat count,
 *     and cancellation fields all derived from the Stripe shape.
 *   - `customer.subscription.deleted` forces the status to "canceled"
 *     and clears `cancel_at_period_end`.
 *   - `checkout.session.completed` writes stripe_customer_id onto the
 *     organization.
 *   - `customer.subscription.trial_will_end` is `handled` with no
 *     mutation in v1.
 *   - Missing organization_id metadata throws and surfaces as `error`.
 */
import { describe, it, expect, beforeEach } from "vitest"
import type Stripe from "stripe"

import { StripeWebhookService } from "@/src/infrastructure/services/stripeWebhookService"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type {
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationMemberWithProfile,
  OrganizationRole,
  OrganizationSeatUsage,
  OrganizationSubscription,
  OrganizationWithSubscription,
  UpdateOrganization,
  UpsertOrganizationSubscription,
} from "@/src/infrastructure/models/billing"

class FakeOrganizationService implements IOrganizationService {
  organizationUpdates: Array<{ id: string; updates: UpdateOrganization }> = []
  subscriptionUpserts: UpsertOrganizationSubscription[] = []
  /** Test-only seam: lets a test pre-stage a "subscription already exists" state. */
  currentSubscription: OrganizationSubscription | null = null

  async createOrganization(): Promise<Organization> {
    throw new Error("not used")
  }
  async getOrganizationById(): Promise<Organization | null> {
    return null
  }
  async getOrganizationByStripeCustomerId(): Promise<Organization | null> {
    return null
  }
  async updateOrganization(id: string, updates: UpdateOrganization): Promise<Organization> {
    this.organizationUpdates.push({ id, updates })
    return {
      id,
      name: "fake",
      billing_email: updates.billing_email ?? null,
      stripe_customer_id: updates.stripe_customer_id ?? null,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }
  async getCurrentOrganizationForUser(): Promise<Organization | null> {
    return null
  }
  async getCurrentOrganizationWithSubscription(): Promise<OrganizationWithSubscription | null> {
    return null
  }
  async addMember(): Promise<OrganizationMember> {
    throw new Error("not used")
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
    return this.currentSubscription
  }
  async upsertSubscription(input: UpsertOrganizationSubscription): Promise<OrganizationSubscription> {
    this.subscriptionUpserts.push(input)
    return {
      id: "sub_row_id",
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
      trial_end: input.trial_end ?? null,
      current_period_start: input.current_period_start ?? null,
      current_period_end: input.current_period_end ?? null,
      cancel_at_period_end: input.cancel_at_period_end ?? false,
      cancel_at: input.cancel_at ?? null,
      canceled_at: input.canceled_at ?? null,
      last_payment_status: input.last_payment_status ?? null,
      last_stripe_event_id: input.last_stripe_event_id ?? null,
      last_stripe_event_created_at: input.last_stripe_event_created_at ?? null,
      is_current: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }
  async createInvitation(): Promise<OrganizationInvitation> {
    throw new Error("not used")
  }
  async getInvitationByToken(): Promise<OrganizationInvitation | null> {
    return null
  }
  async updateInvitation(): Promise<OrganizationInvitation> {
    throw new Error("not used")
  }
  async listPendingInvitations(): Promise<OrganizationInvitation[]> {
    return []
  }
  async getSeatUsage(): Promise<OrganizationSeatUsage> {
    return {
      purchased: 0,
      active_members: 0,
      pending_invites: 0,
      used: 0,
      available: 0,
    }
  }
  async getMemberRole(): Promise<OrganizationRole | null> {
    return null
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

const ORG_ID = "00000000-0000-0000-0000-0000000000ab"

function makeSubscriptionEvent(
  type:
    | "customer.subscription.created"
    | "customer.subscription.updated"
    | "customer.subscription.deleted"
    | "customer.subscription.trial_will_end",
  override: Partial<Stripe.Subscription> = {}
): Stripe.Event {
  const baseSub = {
    id: "sub_test_123",
    status: type === "customer.subscription.deleted" ? "canceled" : "trialing",
    metadata: { organization_id: ORG_ID, plan_tier: "pro", billing_interval: "annual" },
    items: {
      object: "list",
      data: [
        {
          id: "si_test_1",
          quantity: 3,
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
          price: {
            id: "price_test_pro_annual",
            product: "rubberfit_pro",
            recurring: { interval: "year" },
            metadata: { tier: "pro" },
          },
        },
      ],
    },
    trial_end: 1_701_500_000,
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    latest_invoice: "in_test_1",
    ...override,
  } as unknown as Stripe.Subscription

  return {
    id: `evt_${type}_${Math.random().toString(36).slice(2)}`,
    type,
    api_version: "2026-04-22.dahlia",
    created: 1_700_000_500,
    data: { object: baseSub },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    object: "event",
  } as unknown as Stripe.Event
}

function makeInvoiceEvent(
  type: "invoice.paid" | "invoice.payment_failed",
  shape: "dahlia" | "legacy",
  override: Record<string, unknown> = {}
): Stripe.Event {
  // dahlia: invoice.parent.subscription_details.{subscription,metadata}
  // legacy: invoice.subscription + invoice.subscription_details.metadata
  const dahlia = {
    id: "in_test_dahlia",
    parent: {
      subscription_details: {
        subscription: "sub_test_123",
        metadata: { organization_id: ORG_ID, plan_tier: "pro" },
      },
    },
    ...override,
  }
  const legacy = {
    id: "in_test_legacy",
    subscription: "sub_test_123",
    subscription_details: {
      metadata: { organization_id: ORG_ID, plan_tier: "pro" },
    },
    ...override,
  }
  const invoice = (shape === "dahlia" ? dahlia : legacy) as unknown as Stripe.Invoice

  return {
    id: `evt_${type}_${Math.random().toString(36).slice(2)}`,
    type,
    api_version: "2026-04-22.dahlia",
    created: 1_700_000_700,
    data: { object: invoice },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    object: "event",
  } as unknown as Stripe.Event
}

function makeCheckoutCompletedEvent(override: Partial<Stripe.Checkout.Session> = {}): Stripe.Event {
  const baseSession = {
    id: "cs_test_1",
    customer: "cus_test_42",
    customer_email: "billing@acme.example",
    metadata: { organization_id: ORG_ID, plan_tier: "pro", billing_interval: "annual" },
    ...override,
  } as unknown as Stripe.Checkout.Session

  return {
    id: "evt_checkout_session_completed_1",
    type: "checkout.session.completed",
    api_version: "2026-04-22.dahlia",
    created: 1_700_000_400,
    data: { object: baseSession },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    object: "event",
  } as unknown as Stripe.Event
}

describe("StripeWebhookService.handleEvent", () => {
  let fakeOrgService: FakeOrganizationService
  let service: StripeWebhookService

  beforeEach(() => {
    fakeOrgService = new FakeOrganizationService()
    service = new StripeWebhookService(fakeOrgService)
  })

  it("skips unknown event types", async () => {
    const event = {
      id: "evt_unknown",
      type: "charge.updated",
      created: 0,
      data: { object: {} },
      object: "event",
    } as unknown as Stripe.Event
    const outcome = await service.handleEvent(event)
    expect(outcome.kind).toBe("skipped")
    expect(fakeOrgService.subscriptionUpserts).toHaveLength(0)
  })

  it("upserts a subscription on customer.subscription.created", async () => {
    const event = makeSubscriptionEvent("customer.subscription.created")
    const outcome = await service.handleEvent(event)
    expect(outcome.kind).toBe("handled")
    expect(fakeOrgService.subscriptionUpserts).toHaveLength(1)
    const payload = fakeOrgService.subscriptionUpserts[0]
    expect(payload.organization_id).toBe(ORG_ID)
    expect(payload.stripe_subscription_id).toBe("sub_test_123")
    expect(payload.plan_tier).toBe("pro")
    expect(payload.billing_interval).toBe("annual")
    expect(payload.seat_count).toBe(3)
    expect(payload.status).toBe("trialing")
    expect(payload.is_current).toBe(true)
    expect(payload.last_stripe_event_id).toBe(event.id)
  })

  it("upserts a subscription on customer.subscription.updated", async () => {
    const event = makeSubscriptionEvent("customer.subscription.updated", {
      cancel_at_period_end: true,
      cancel_at: 1_703_000_000,
    } as unknown as Partial<Stripe.Subscription>)
    const outcome = await service.handleEvent(event)
    expect(outcome.kind).toBe("handled")
    const payload = fakeOrgService.subscriptionUpserts[0]
    expect(payload.cancel_at_period_end).toBe(true)
    expect(payload.cancel_at).toMatch(/^2023-/)
  })

  it("forces status=canceled on customer.subscription.deleted", async () => {
    const event = makeSubscriptionEvent("customer.subscription.deleted", {
      canceled_at: 1_702_500_000,
    } as unknown as Partial<Stripe.Subscription>)
    const outcome = await service.handleEvent(event)
    expect(outcome.kind).toBe("handled")
    const payload = fakeOrgService.subscriptionUpserts[0]
    expect(payload.status).toBe("canceled")
    expect(payload.cancel_at_period_end).toBe(false)
    expect(payload.canceled_at).toMatch(/^2023-/)
  })

  it("acknowledges customer.subscription.trial_will_end without mutating", async () => {
    const event = makeSubscriptionEvent("customer.subscription.trial_will_end")
    const outcome = await service.handleEvent(event)
    expect(outcome.kind).toBe("handled")
    expect(fakeOrgService.subscriptionUpserts).toHaveLength(0)
  })

  it("links stripe_customer_id on checkout.session.completed", async () => {
    const event = makeCheckoutCompletedEvent()
    const outcome = await service.handleEvent(event)
    expect(outcome.kind).toBe("handled")
    expect(fakeOrgService.organizationUpdates).toHaveLength(1)
    expect(fakeOrgService.organizationUpdates[0]).toEqual({
      id: ORG_ID,
      updates: {
        stripe_customer_id: "cus_test_42",
        billing_email: "billing@acme.example",
      },
    })
  })

  it("skips invoice.paid when no subscription row exists yet", async () => {
    // fakeOrgService.currentSubscription remains null → service skips.
    const event = makeInvoiceEvent("invoice.paid", "dahlia")
    const outcome = await service.handleEvent(event)
    expect(outcome.kind).toBe("skipped")
    expect(fakeOrgService.subscriptionUpserts).toHaveLength(0)
  })

  it("records last_payment_status on invoice.paid when subscription row exists (dahlia API shape)", async () => {
    fakeOrgService.currentSubscription = {
      id: "sub_row",
      organization_id: ORG_ID,
      stripe_subscription_id: "sub_test_123",
      stripe_subscription_item_id: "si_test_1",
      stripe_price_id: "price_test_pro_annual",
      stripe_product_id: "rubberfit_pro",
      latest_invoice_id: null,
      plan_tier: "pro",
      billing_interval: "annual",
      seat_count: 3,
      status: "active",
      trial_end: null,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date().toISOString(),
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      last_payment_status: null,
      last_stripe_event_id: null,
      last_stripe_event_created_at: null,
      is_current: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const event = makeInvoiceEvent("invoice.paid", "dahlia")
    const outcome = await service.handleEvent(event)
    expect(outcome.kind).toBe("handled")
    expect(fakeOrgService.subscriptionUpserts).toHaveLength(1)
    const payload = fakeOrgService.subscriptionUpserts[0]
    expect(payload.stripe_subscription_id).toBe("sub_test_123")
    expect(payload.last_payment_status).toBe("paid")
    expect(payload.latest_invoice_id).toBe("in_test_dahlia")
  })

  it("records last_payment_status on invoice.payment_failed (legacy API shape)", async () => {
    fakeOrgService.currentSubscription = {
      id: "sub_row",
      organization_id: ORG_ID,
      stripe_subscription_id: "sub_test_123",
      stripe_subscription_item_id: "si_test_1",
      stripe_price_id: "price_test_pro_annual",
      stripe_product_id: "rubberfit_pro",
      latest_invoice_id: null,
      plan_tier: "pro",
      billing_interval: "annual",
      seat_count: 3,
      status: "past_due",
      trial_end: null,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date().toISOString(),
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      last_payment_status: null,
      last_stripe_event_id: null,
      last_stripe_event_created_at: null,
      is_current: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const event = makeInvoiceEvent("invoice.payment_failed", "legacy")
    const outcome = await service.handleEvent(event)
    expect(outcome.kind).toBe("handled")
    const payload = fakeOrgService.subscriptionUpserts[0]
    expect(payload.last_payment_status).toBe("failed")
    expect(payload.latest_invoice_id).toBe("in_test_legacy")
  })

  it("returns an `error` outcome when subscription event lacks organization_id metadata", async () => {
    const event = makeSubscriptionEvent("customer.subscription.created", {
      metadata: {},
    } as unknown as Partial<Stripe.Subscription>)
    // Also clear the event-level metadata fallback.
    ;(event.data.object as unknown as { metadata: Record<string, string> }).metadata = {}
    const outcome = await service.handleEvent(event)
    expect(outcome.kind).toBe("error")
    if (outcome.kind === "error") {
      expect(outcome.error.message).toContain("organization_id")
    }
    expect(fakeOrgService.subscriptionUpserts).toHaveLength(0)
  })
})
