import { randomUUID } from "node:crypto"

import Stripe from "stripe"

import {
  deleteTestOrganization,
  provisionOrgAtTier,
  type ProvisionTierOptions,
  type TestOrganization,
} from "./billing"
import { adminClient, type TestUser } from "./auth"

import type { BillingInterval, PlanTier } from "@/src/infrastructure/models/billing"

const STRIPE_API_VERSION = "2026-04-22.dahlia" as const

/**
 * Stable identifiers for the simulated "Portal-rotated" Max annual
 * price + product. Exported so the spec can assert against the exact
 * values the fixture wrote into the webhook payload without the two
 * files drifting apart.
 */
export const MAX_ANNUAL_PRICE_ID = "price_max_annual_test"
export const MAX_PRODUCT_ID = "rubberfit_max"

interface StripeIds {
  stripeCustomerId: string
  stripeSubscriptionId: string
  stripeSubscriptionItemId: string
  stripePriceId: string
  stripeProductId: string
}

export interface StripeBackedOrganization extends TestOrganization, StripeIds {}

export interface ProvisionStripeBackedOrgOptions extends Pick<
  ProvisionTierOptions,
  "organizationName" | "status"
> {
  tier: PlanTier
  billingInterval?: BillingInterval
  stripePriceId?: string
  stripeProductId?: string
}

interface StripeEventRequestShape {
  eventId: string
  payload: string
  signature: string
}

interface PortalUpgradeEventInput {
  organizationId: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  stripeSubscriptionItemId: string
}

interface StripeWebhookEventPayload {
  id: string
  object: "event"
  api_version: typeof STRIPE_API_VERSION
  created: number
  data: {
    object: StripeSubscriptionPayload
  }
  livemode: false
  pending_webhooks: number
  request: {
    id: string | null
    idempotency_key: string | null
  }
  type: "customer.subscription.updated"
}

interface StripeSubscriptionPayload {
  id: string
  object: "subscription"
  status: "active"
  customer: string
  metadata: {
    organization_id: string
    plan_tier: "pro"
    billing_interval: "monthly"
  }
  items: {
    object: "list"
    data: StripeSubscriptionItemPayload[]
  }
  trial_end: null
  cancel_at_period_end: false
  cancel_at: null
  canceled_at: null
  latest_invoice: string
}

interface StripeSubscriptionItemPayload {
  id: string
  object: "subscription_item"
  quantity: number
  current_period_start: number
  current_period_end: number
  price: StripePricePayload
}

interface StripePricePayload {
  id: typeof MAX_ANNUAL_PRICE_ID
  object: "price"
  product: typeof MAX_PRODUCT_ID
  recurring: {
    interval: "year"
  }
  metadata: {
    tier: "max"
  }
}

export interface SubscriptionSnapshot {
  organization_id: string
  stripe_subscription_id: string | null
  stripe_subscription_item_id: string | null
  stripe_price_id: string | null
  stripe_product_id: string | null
  plan_tier: PlanTier
  billing_interval: BillingInterval | null
  status: string
  last_stripe_event_id: string | null
  is_current: boolean
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`e2e stripe fixture requires ${name}`)
  }
  return value
}

function shortId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 18)
}

function makeStripeIds(priceId: string, productId: string): StripeIds {
  const suffix = shortId()
  return {
    stripeCustomerId: `cus_e2e_${suffix}`,
    stripeSubscriptionId: `sub_e2e_${suffix}`,
    stripeSubscriptionItemId: `si_e2e_${suffix}`,
    stripePriceId: priceId,
    stripeProductId: productId,
  }
}

export async function provisionStripeBackedOrgAtTier(
  user: TestUser,
  opts: ProvisionStripeBackedOrgOptions
): Promise<StripeBackedOrganization> {
  const billingInterval = opts.billingInterval ?? "monthly"
  const priceId = opts.stripePriceId ?? `price_${opts.tier}_${billingInterval}_test`
  const productId = opts.stripeProductId ?? `rubberfit_${opts.tier}`
  const stripeIds = makeStripeIds(priceId, productId)
  const org = await provisionOrgAtTier(user, {
    tier: opts.tier,
    status: opts.status,
    organizationName: opts.organizationName,
  })

  try {
    const { error: orgError } = await adminClient
      .from("organizations")
      .update({ stripe_customer_id: stripeIds.stripeCustomerId })
      .eq("id", org.id)

    if (orgError) {
      throw new Error(
        `provisionStripeBackedOrgAtTier: org stripe patch failed - ${orgError.message}`
      )
    }

    const { data: subRows, error: subError } = await adminClient
      .from("organization_subscriptions")
      .update({
        stripe_subscription_id: stripeIds.stripeSubscriptionId,
        stripe_subscription_item_id: stripeIds.stripeSubscriptionItemId,
        stripe_price_id: stripeIds.stripePriceId,
        stripe_product_id: stripeIds.stripeProductId,
        billing_interval: billingInterval,
      })
      .eq("organization_id", org.id)
      .eq("is_current", true)
      .select("id")

    if (subError || !subRows || subRows.length !== 1) {
      const detail = subError?.message ?? `expected 1 affected row, got ${subRows?.length ?? 0}`
      throw new Error(
        `provisionStripeBackedOrgAtTier: subscription stripe patch failed - ${detail}`
      )
    }

    return { ...org, ...stripeIds }
  } catch (err) {
    await deleteTestOrganization(org.id).catch(() => undefined)
    throw err
  }
}

export function makePortalUpgradeToMaxAnnualEvent(
  input: PortalUpgradeEventInput
): StripeEventRequestShape {
  const created = Math.floor(Date.now() / 1000)
  const eventId = `evt_e2e_portal_upgrade_${shortId()}`
  const event: StripeWebhookEventPayload = {
    id: eventId,
    object: "event",
    api_version: STRIPE_API_VERSION,
    created,
    data: {
      object: {
        id: input.stripeSubscriptionId,
        object: "subscription",
        status: "active",
        customer: input.stripeCustomerId,
        metadata: {
          organization_id: input.organizationId,
          plan_tier: "pro",
          billing_interval: "monthly",
        },
        items: {
          object: "list",
          data: [
            {
              id: input.stripeSubscriptionItemId,
              object: "subscription_item",
              quantity: 1,
              current_period_start: created,
              current_period_end: created + 365 * 24 * 60 * 60,
              price: {
                id: MAX_ANNUAL_PRICE_ID,
                object: "price",
                product: MAX_PRODUCT_ID,
                recurring: { interval: "year" },
                metadata: { tier: "max" },
              },
            },
          ],
        },
        trial_end: null,
        cancel_at_period_end: false,
        cancel_at: null,
        canceled_at: null,
        latest_invoice: "in_e2e_portal_upgrade_max_annual",
      },
    },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: "customer.subscription.updated",
  }
  const payload = JSON.stringify(event)
  const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  })
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: requireEnv("STRIPE_WEBHOOK_SECRET"),
  })

  return { eventId, payload, signature }
}

export async function readCurrentSubscriptionForOrg(
  organizationId: string
): Promise<SubscriptionSnapshot> {
  const { data, error } = await adminClient
    .from("organization_subscriptions")
    .select(
      "organization_id, stripe_subscription_id, stripe_subscription_item_id, stripe_price_id, stripe_product_id, plan_tier, billing_interval, status, last_stripe_event_id, is_current"
    )
    .eq("organization_id", organizationId)
    .eq("is_current", true)
    .single()

  if (error || !data) {
    throw new Error(
      `readCurrentSubscriptionForOrg: ${error?.message ?? `no current row for ${organizationId}`}`
    )
  }

  return data as SubscriptionSnapshot
}

export async function deleteStripeEvent(eventId: string): Promise<void> {
  const { error } = await adminClient.from("stripe_events").delete().eq("stripe_event_id", eventId)
  if (error) {
    throw new Error(`deleteStripeEvent: ${error.message}`)
  }
}
