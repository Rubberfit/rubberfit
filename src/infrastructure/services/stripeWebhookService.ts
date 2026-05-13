import "reflect-metadata"
import { injectable } from "tsyringe"
import type Stripe from "stripe"

import type {
  IStripeWebhookService,
  StripeEventRecord,
  StripeWebhookOutcome,
} from "@/src/application/services/stripe-webhook.service.interface"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import { organizationService } from "@/src/infrastructure/services/organizationService"
import { makeAdminClient } from "@/src/infrastructure/supabase/server-clients"
import type {
  BillingInterval,
  PlanTier,
  SubscriptionStatus,
  UpsertOrganizationSubscription,
} from "@/src/infrastructure/models/billing"

/**
 * Event types we currently react to. Any other event passes through as
 * `skipped` so Stripe stops retrying.
 */
const HANDLED_EVENT_TYPES = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
])

/** Stripe surfaces strings; the DB has a stricter enum. Map and validate. */
const SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
])
const PLAN_TIERS = new Set<PlanTier>(["standard", "pro", "max", "enterprise"])
const BILLING_INTERVALS = new Set<BillingInterval>(["monthly", "annual"])

function asSubscriptionStatus(value: string): SubscriptionStatus {
  if (!SUBSCRIPTION_STATUSES.has(value as SubscriptionStatus)) {
    throw new Error(`Unknown Stripe subscription.status: ${value}`)
  }
  return value as SubscriptionStatus
}

function asPlanTier(value: string | null | undefined): PlanTier | null {
  if (!value) return null
  if (!PLAN_TIERS.has(value as PlanTier)) return null
  return value as PlanTier
}

function asBillingInterval(value: string | null | undefined): BillingInterval | null {
  if (!value) return null
  if (!BILLING_INTERVALS.has(value as BillingInterval)) return null
  return value as BillingInterval
}

function tsToIso(value: number | null | undefined): string | null {
  if (value == null) return null
  return new Date(value * 1000).toISOString()
}

function extractOrganizationId(
  event: Stripe.Event,
  subscription?: Stripe.Subscription
): string | null {
  // Prefer the subscription's metadata (set on Checkout session creation),
  // falling back to the event's data object's metadata when present.
  const subMeta = subscription?.metadata?.organization_id
  if (typeof subMeta === "string" && subMeta.length > 0) return subMeta
  const obj = event.data.object as unknown as { metadata?: Record<string, string> } | undefined
  const objMeta = obj?.metadata?.organization_id
  if (typeof objMeta === "string" && objMeta.length > 0) return objMeta
  return null
}

function extractPlanTier(
  subscription: Stripe.Subscription,
  price: Stripe.Price | undefined
): PlanTier {
  const fromSub = asPlanTier(subscription.metadata?.plan_tier)
  if (fromSub) return fromSub
  const fromPriceMeta = asPlanTier((price?.metadata as Record<string, string> | undefined)?.tier)
  if (fromPriceMeta) return fromPriceMeta
  // Stripe stores plan tier on subscription.metadata.plan_tier (set at
  // Checkout) or price.metadata.tier (set by stripe-setup). Reaching this
  // line means the catalog is mis-provisioned — warn loudly so on-call sees
  // it before a customer notices the silent downgrade.
  console.warn(
    `[stripe-webhook] subscription=${subscription.id} missing plan_tier metadata on both subscription and price; defaulting to "standard". Re-run npm run stripe:setup to backfill.`
  )
  return "standard"
}

function extractBillingInterval(
  subscription: Stripe.Subscription,
  price: Stripe.Price | undefined
): BillingInterval | null {
  const fromSub = asBillingInterval(subscription.metadata?.billing_interval)
  if (fromSub) return fromSub
  const stripeInterval = price?.recurring?.interval
  if (stripeInterval === "year") return "annual"
  if (stripeInterval === "month") return "monthly"
  return null
}

function extractProductId(price: Stripe.Price | undefined): string | null {
  const product = price?.product
  if (typeof product === "string") return product
  if (product && typeof product === "object" && "id" in product) {
    return (product as { id: string }).id
  }
  return null
}

function extractLatestInvoiceId(subscription: Stripe.Subscription): string | null {
  const invoice = subscription.latest_invoice
  if (typeof invoice === "string") return invoice
  return invoice?.id ?? null
}

function extractPeriodTimestamp(
  item: Stripe.SubscriptionItem | undefined,
  subscription: Stripe.Subscription,
  field: "current_period_start" | "current_period_end"
): string | null {
  // `current_period_start`/`current_period_end` moved from
  // Subscription onto SubscriptionItem in the dahlia API. We read
  // from the item first; falling back to the subscription keeps
  // older API-version fixtures + replayed historical events working.
  const itemTs = (item as unknown as Record<string, number | undefined>)?.[field]
  if (itemTs != null) return tsToIso(itemTs)
  const subTs = (subscription as unknown as Record<string, number | undefined>)[field]
  return tsToIso(subTs ?? null)
}

/**
 * Pull the subscription id off an Invoice across dahlia + legacy API
 * shapes. In dahlia the field lives at `invoice.parent.subscription_details.subscription`;
 * pre-dahlia it was the top-level `invoice.subscription`.
 */
function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  type ParentShape = {
    subscription_details?: { subscription?: string | { id: string } }
  }
  const parent = (invoice as unknown as { parent?: ParentShape }).parent
  const fromParent = parent?.subscription_details?.subscription
  if (typeof fromParent === "string") return fromParent
  if (fromParent && typeof fromParent === "object" && "id" in fromParent) return fromParent.id

  type LegacyShape = { subscription?: string | { id: string } }
  const legacy = (invoice as unknown as LegacyShape).subscription
  if (typeof legacy === "string") return legacy
  if (legacy && typeof legacy === "object" && "id" in legacy) return legacy.id

  return null
}

/**
 * Same dahlia/legacy fallback for invoice-level organization_id.
 * dahlia: `invoice.parent.subscription_details.metadata.organization_id`
 * legacy: `invoice.subscription_details.metadata.organization_id`
 *         or `invoice.metadata.organization_id` if directly attached.
 */
function extractInvoiceOrganizationId(invoice: Stripe.Invoice): string | null {
  type ParentShape = {
    subscription_details?: { metadata?: Record<string, string> }
  }
  const parent = (invoice as unknown as { parent?: ParentShape }).parent
  const fromParent = parent?.subscription_details?.metadata?.organization_id
  if (typeof fromParent === "string" && fromParent.length > 0) return fromParent

  type LegacyShape = {
    metadata?: Record<string, string>
    subscription_details?: { metadata?: Record<string, string> }
  }
  const legacyTop = (invoice as unknown as LegacyShape).metadata?.organization_id
  if (typeof legacyTop === "string" && legacyTop.length > 0) return legacyTop
  const legacyNested = (invoice as unknown as LegacyShape).subscription_details?.metadata
    ?.organization_id
  if (typeof legacyNested === "string" && legacyNested.length > 0) return legacyNested
  return null
}

/**
 * Map a Stripe Subscription onto the org subscription upsert payload.
 * Trial / period / cancellation fields all flow from Stripe-side truth.
 */
function extractSeatCount(
  subscription: Stripe.Subscription,
  firstItem: Stripe.SubscriptionItem | undefined
): number {
  const quantity = firstItem?.quantity
  if (typeof quantity === "number" && Number.isInteger(quantity) && quantity >= 1) {
    return quantity
  }
  // Subscription line items don't equal seats; if the first item lacks a
  // valid quantity, the subscription is mis-configured. Fall back to 1 so
  // the upsert succeeds but warn so on-call notices.
  console.warn(
    `[stripe-webhook] subscription=${subscription.id} first item missing quantity; defaulting seat_count to 1. Check Stripe Dashboard for the affected line item.`
  )
  return 1
}

function subscriptionToUpsert(
  organizationId: string,
  subscription: Stripe.Subscription,
  lastEvent: Stripe.Event
): UpsertOrganizationSubscription {
  const firstItem = subscription.items.data[0]
  const price = firstItem?.price

  return {
    organization_id: organizationId,
    stripe_subscription_id: subscription.id,
    stripe_subscription_item_id: firstItem?.id ?? null,
    stripe_price_id: price?.id ?? null,
    stripe_product_id: extractProductId(price),
    plan_tier: extractPlanTier(subscription, price),
    billing_interval: extractBillingInterval(subscription, price),
    seat_count: extractSeatCount(subscription, firstItem),
    status: asSubscriptionStatus(subscription.status),
    trial_end: tsToIso(subscription.trial_end ?? null),
    current_period_start: extractPeriodTimestamp(firstItem, subscription, "current_period_start"),
    current_period_end: extractPeriodTimestamp(firstItem, subscription, "current_period_end"),
    cancel_at_period_end: subscription.cancel_at_period_end,
    cancel_at: tsToIso(subscription.cancel_at ?? null),
    canceled_at: tsToIso(subscription.canceled_at ?? null),
    latest_invoice_id: extractLatestInvoiceId(subscription),
    last_stripe_event_id: lastEvent.id,
    last_stripe_event_created_at: tsToIso(lastEvent.created),
    is_current: true,
  }
}

@injectable()
export class StripeWebhookService implements IStripeWebhookService {
  constructor(private readonly organizationService: IOrganizationService) {}

  async recordEventReceived(input: {
    eventId: string
    eventType: string
    eventCreatedAt: string
  }): Promise<StripeEventRecord> {
    const adminClient = makeAdminClient()
    if (!adminClient) {
      return {
        kind: "error",
        error: new Error("SUPABASE_SERVICE_ROLE_KEY is not configured"),
      }
    }

    // First-write wins. A unique-constraint violation means we've
    // seen this event id before — we then need to decide whether the
    // previous attempt fully `processed` (truly duplicate, skip) or
    // failed mid-flight (`pending`/`error`, allow retry).
    const { error } = await adminClient.from("stripe_events").insert({
      stripe_event_id: input.eventId,
      type: input.eventType,
      status: "pending",
      attempt_count: 1,
      event_created_at: input.eventCreatedAt,
    })
    if (!error) return { kind: "accepted" }

    const message = error.message ?? ""
    const isDuplicate =
      error.code === "23505" ||
      message.includes("duplicate key") ||
      message.includes("stripe_events_pkey")
    if (!isDuplicate) return { kind: "error", error: new Error(message) }

    // Existing row — look it up to decide if it's truly processed.
    const { data: existing, error: lookupError } = await adminClient
      .from("stripe_events")
      .select("status, attempt_count")
      .eq("stripe_event_id", input.eventId)
      .maybeSingle()
    if (lookupError) return { kind: "error", error: new Error(lookupError.message) }
    if (!existing) {
      return {
        kind: "error",
        error: new Error(
          `Duplicate stripe_event_id ${input.eventId} but row not retrievable for status check`
        ),
      }
    }

    const status = (existing as { status: string; attempt_count: number }).status
    const attemptCount = (existing as { status: string; attempt_count: number }).attempt_count ?? 0

    if (status === "processed") return { kind: "duplicate" }

    // Pending or error: a prior attempt is incomplete. Bump
    // attempt_count + reset status='pending' so markEventOutcome can
    // overwrite cleanly, then let the route re-run handleEvent.
    const nextAttempt = attemptCount + 1
    await adminClient
      .from("stripe_events")
      .update({ status: "pending", attempt_count: nextAttempt, error: null })
      .eq("stripe_event_id", input.eventId)

    return {
      kind: "retry",
      previousStatus: status === "pending" || status === "error" ? status : "error",
      attemptCount: nextAttempt,
    }
  }

  async markEventOutcome(eventId: string, outcome: StripeWebhookOutcome): Promise<void> {
    const adminClient = makeAdminClient()
    if (!adminClient) {
      // No DB available — operator-visible. We log but don't throw
      // because the outer route handler has already shaped its
      // HTTP response based on the in-memory outcome. In practice
      // this branch is unreachable: recordEventReceived would have
      // already returned an error if the service-role client was
      // unavailable, and the route returns 500 before reaching us.
      console.error(`stripe_events update skipped (no service-role client) for ${eventId}`)
      return
    }
    const update =
      outcome.kind === "error"
        ? {
            status: "error" as const,
            error: outcome.error.message,
            processed_at: new Date().toISOString(),
          }
        : {
            status: "processed" as const,
            error: null,
            processed_at: new Date().toISOString(),
          }
    await adminClient.from("stripe_events").update(update).eq("stripe_event_id", eventId)
  }

  async handleEvent(event: Stripe.Event): Promise<StripeWebhookOutcome> {
    if (!HANDLED_EVENT_TYPES.has(event.type)) {
      return {
        kind: "skipped",
        eventType: event.type,
        reason: "event type not handled",
      }
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
          return await this.handleCheckoutCompleted(event)
        case "customer.subscription.created":
        case "customer.subscription.updated":
          return await this.handleSubscriptionUpsert(event)
        case "customer.subscription.deleted":
          return await this.handleSubscriptionDeleted(event)
        case "customer.subscription.trial_will_end":
          // v1: no DB mutation. The countdown banner reads
          // trial_end + current time and renders itself. PR 6
          // hooks a transactional email here.
          return {
            kind: "handled",
            eventType: event.type,
            note: "trial_will_end logged; no DB mutation in v1",
          }
        case "invoice.paid":
        case "invoice.payment_failed":
          return await this.handleInvoiceEvent(event)
        default:
          return {
            kind: "skipped",
            eventType: event.type,
            reason: "event type fell through switch — unexpected",
          }
      }
    } catch (err) {
      return {
        kind: "error",
        eventType: event.type,
        error: err instanceof Error ? err : new Error(String(err)),
      }
    }
  }

  private async handleCheckoutCompleted(event: Stripe.Event): Promise<StripeWebhookOutcome> {
    const session = event.data.object as Stripe.Checkout.Session

    const organizationId = session.metadata?.organization_id
    if (!organizationId) {
      throw new Error(
        `checkout.session.completed missing metadata.organization_id (session ${session.id})`
      )
    }

    // Pin the Customer ID + billing_email on the org row so future
    // webhook events can match either by metadata or by Customer.
    const stripeCustomerId =
      typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null)
    if (stripeCustomerId) {
      await this.organizationService.updateOrganization(organizationId, {
        stripe_customer_id: stripeCustomerId,
        billing_email: session.customer_email ?? session.customer_details?.email ?? null,
      })
    }

    // The customer.subscription.created event will arrive separately
    // and carries the canonical subscription state. Nothing else to
    // mutate here.
    return {
      kind: "handled",
      eventType: event.type,
      note: stripeCustomerId
        ? `linked stripe_customer_id ${stripeCustomerId} to org ${organizationId}`
        : "no Stripe customer attached to session",
    }
  }

  private async handleSubscriptionUpsert(event: Stripe.Event): Promise<StripeWebhookOutcome> {
    const subscription = event.data.object as Stripe.Subscription
    const organizationId = extractOrganizationId(event, subscription)
    if (!organizationId) {
      throw new Error(
        `${event.type} missing organization_id metadata (subscription ${subscription.id})`
      )
    }

    const payload = subscriptionToUpsert(organizationId, subscription, event)
    await this.organizationService.upsertSubscription(payload)

    return {
      kind: "handled",
      eventType: event.type,
      note: `upserted subscription ${subscription.id} → status=${payload.status}`,
    }
  }

  private async handleSubscriptionDeleted(event: Stripe.Event): Promise<StripeWebhookOutcome> {
    const subscription = event.data.object as Stripe.Subscription
    const organizationId = extractOrganizationId(event, subscription)
    if (!organizationId) {
      throw new Error(
        `customer.subscription.deleted missing organization_id metadata (subscription ${subscription.id})`
      )
    }

    // `subscription.status` is `canceled` when `deleted` fires. The
    // cancel_at_period_end flag is reset by Stripe at this point.
    // We still upsert through the same path so the row's terminal
    // state is consistent with the rest of the lifecycle.
    const payload: UpsertOrganizationSubscription = {
      ...subscriptionToUpsert(organizationId, subscription, event),
      status: "canceled",
      cancel_at_period_end: false,
      canceled_at: tsToIso(subscription.canceled_at ?? event.created),
    }
    await this.organizationService.upsertSubscription(payload)

    return {
      kind: "handled",
      eventType: event.type,
      note: `marked subscription ${subscription.id} canceled`,
    }
  }

  private async handleInvoiceEvent(event: Stripe.Event): Promise<StripeWebhookOutcome> {
    const invoice = event.data.object as Stripe.Invoice
    const subscriptionId = extractInvoiceSubscriptionId(invoice)
    if (!subscriptionId) {
      return {
        kind: "skipped",
        eventType: event.type,
        reason: "invoice has no subscription — one-off or setup-mode invoice",
      }
    }

    const organizationId = extractInvoiceOrganizationId(invoice)
    if (!organizationId) {
      return {
        kind: "skipped",
        eventType: event.type,
        reason: "invoice missing organization_id; subscription.updated will carry the state",
      }
    }

    // Refuse to insert a stub subscription row from an invoice
    // payload. Stripe does NOT guarantee event delivery ordering;
    // if invoice.paid arrives before customer.subscription.created,
    // a naive upsert here would create a row with default plan_tier
    // + status='incomplete' that briefly mis-gates the user. Stripe
    // will retry the invoice event after the subscription row exists.
    const existing = await this.organizationService.getCurrentSubscription(organizationId)
    if (!existing || existing.stripe_subscription_id !== subscriptionId) {
      return {
        kind: "skipped",
        eventType: event.type,
        reason: `no organization_subscriptions row yet for ${subscriptionId}; subscription.updated will carry the state`,
      }
    }

    const payload: UpsertOrganizationSubscription = {
      organization_id: organizationId,
      stripe_subscription_id: subscriptionId,
      last_payment_status: event.type === "invoice.paid" ? "paid" : "failed",
      latest_invoice_id: invoice.id ?? null,
      last_stripe_event_id: event.id,
      last_stripe_event_created_at: tsToIso(event.created),
    }
    await this.organizationService.upsertSubscription(payload)

    return {
      kind: "handled",
      eventType: event.type,
      note: `recorded ${event.type} on subscription ${subscriptionId}`,
    }
  }
}

export const stripeWebhookService = new StripeWebhookService(organizationService)
