import "reflect-metadata"
import { inject, injectable } from "tsyringe"
import type Stripe from "stripe"

import { TOKENS } from "@/di/tokens"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type { IStripeClientService } from "@/src/application/services/stripe-client.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import type { Organization, UpdateOrganization } from "@/src/infrastructure/models/billing"

import {
  type CheckoutBillingInterval,
  type CheckoutPlanTier,
  isCheckoutPlanTier,
} from "./billing-plan"

const PRODUCT_KEY = "rubberfit"
const PRICE_VERSION = "v1"
const TRIAL_PERIOD_DAYS = 14

// Marketing site origin. MARKETING_URL is server-only; falls back to
// NEXT_PUBLIC_MARKETING_URL for compatibility with dev/preview envs that
// only set the public variant, then to the production canonical.
function marketingUrl(): string {
  return (
    process.env.MARKETING_URL?.trim() ||
    process.env.NEXT_PUBLIC_MARKETING_URL?.trim() ||
    "https://get.rubberfit.app"
  )
}
function checkoutSuccessUrl(): string {
  return `${marketingUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
}
function checkoutCancelUrl(): string {
  return `${marketingUrl()}/checkout/cancel`
}

export interface CreateCheckoutSessionInput {
  organizationId: string
  billingInterval: CheckoutBillingInterval
  actor: ActionActor
}

export interface CreateCheckoutSessionResult {
  url: string
}

export interface ICreateCheckoutSessionUseCase {
  execute(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult>
}

function lookupKey(tier: CheckoutPlanTier, interval: CheckoutBillingInterval): string {
  return `${PRODUCT_KEY}.${tier}.${interval}.${PRICE_VERSION}`
}

@injectable()
export class CreateCheckoutSessionUseCase implements ICreateCheckoutSessionUseCase {
  constructor(
    @inject(TOKENS.IOrganizationService)
    private readonly organizationService: IOrganizationService,
    @inject(TOKENS.IStripeClientService)
    private readonly stripeClientService: IStripeClientService
  ) {}

  async execute(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult> {
    const organization = await this.organizationService.getOrganizationById(input.organizationId)
    if (!organization) throw new Error("Organization not found")

    const role = await this.organizationService.getMemberRole(organization.id, input.actor.id)
    if (role !== "owner" && role !== "admin") {
      throw new Error("Only organization owners and admins can start checkout")
    }

    const subscription = await this.organizationService.getCurrentSubscription(organization.id)
    if (!subscription) throw new Error("Organization has no pending subscription")
    if (!isCheckoutPlanTier(subscription.plan_tier)) {
      throw new Error("Selected plan is not available for self-serve checkout")
    }
    if (
      !Number.isInteger(subscription.seat_count) ||
      subscription.seat_count < 1 ||
      subscription.seat_count > 500
    ) {
      throw new Error("Seat count must be between 1 and 500")
    }

    const stripe = this.stripeClientService.getClient()
    const stripeCustomerId = await this.ensureStripeCustomer(stripe, organization, input.actor)
    const priceKey = lookupKey(subscription.plan_tier, input.billingInterval)
    const prices = await stripe.prices.list({ lookup_keys: [priceKey], active: true, limit: 1 })
    const price = prices.data[0]
    if (!price) throw new Error(`Stripe Price not found for lookup key ${priceKey}`)

    const metadata = {
      product: PRODUCT_KEY,
      organization_id: organization.id,
      plan_tier: subscription.plan_tier,
      billing_interval: input.billingInterval,
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      ui_mode: "hosted_page",
      payment_method_collection: "always",
      billing_address_collection: "required",
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      customer: stripeCustomerId,
      customer_update: { address: "auto", name: "auto" },
      line_items: [{ price: price.id, quantity: subscription.seat_count }],
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata,
      },
      metadata,
      success_url: checkoutSuccessUrl(),
      cancel_url: checkoutCancelUrl(),
    }

    const session = await stripe.checkout.sessions.create(params)
    if (!session.url) throw new Error("Stripe Checkout Session did not return a URL")

    return { url: session.url }
  }

  private async ensureStripeCustomer(
    stripe: ReturnType<IStripeClientService["getClient"]>,
    organization: Organization,
    actor: ActionActor
  ): Promise<string> {
    if (organization.stripe_customer_id) return organization.stripe_customer_id

    const billingEmail = organization.billing_email ?? actor.email
    const params: Stripe.CustomerCreateParams = {
      name: organization.name,
      metadata: {
        product: PRODUCT_KEY,
        organization_id: organization.id,
      },
    }
    if (billingEmail) params.email = billingEmail

    // Pass an idempotency key keyed on the org id so a retry within
    // Stripe's 24h idempotency window reuses the same Customer instead
    // of orphaning one if the DB write below transiently fails.
    const customer = await stripe.customers.create(params, {
      idempotencyKey: `org-customer:${organization.id}`,
    })
    const updates: UpdateOrganization = { stripe_customer_id: customer.id }
    if (billingEmail) updates.billing_email = billingEmail
    await this.organizationService.updateOrganization(organization.id, updates)

    return customer.id
  }
}
