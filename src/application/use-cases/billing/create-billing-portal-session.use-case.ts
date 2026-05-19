import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type { IStripeClientService } from "@/src/application/services/stripe-client.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"

export type CreateBillingPortalSessionError =
  | "forbidden"
  | "organization_not_found"
  | "subscription_not_found"
  | "checkout_required"
  | "restart_subscription"
  | "enterprise_account"
  | "stripe_customer_missing"
  | "stripe_portal_unavailable"
  | "invalid_return_path"

export interface CreateBillingPortalSessionInput {
  organizationId: string
  returnPath?: string
  actor: ActionActor
}

export type CreateBillingPortalSessionResult =
  | { url: string }
  | { error: CreateBillingPortalSessionError }

export interface ICreateBillingPortalSessionUseCase {
  execute(input: CreateBillingPortalSessionInput): Promise<CreateBillingPortalSessionResult>
}

const DEFAULT_RETURN_PATH = "/dashboard/settings/billing"

function appUrl(): string {
  const raw =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://rubberfit.app"
  return raw.replace(/\/+$/, "")
}

function portalConfigurationId(): string | undefined {
  const raw = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim()
  return raw && raw.length > 0 ? raw : undefined
}

/**
 * Normalize a caller-supplied return path. Same-origin only — reject
 * absolute URLs, protocol-relative `//host`, backslash escapes, and
 * anything that doesn't start with a single `/`. Stripe will redirect
 * customers to this URL after they close the Portal, so an unguarded
 * value is an open redirect.
 */
function normalizeReturnPath(input: string | undefined): string | null {
  if (input == null) return DEFAULT_RETURN_PATH
  const trimmed = input.trim()
  if (trimmed.length === 0) return DEFAULT_RETURN_PATH
  if (trimmed.includes("\\")) return null
  if (!trimmed.startsWith("/")) return null
  if (trimmed.startsWith("//")) return null
  return trimmed
}

@injectable()
export class CreateBillingPortalSessionUseCase implements ICreateBillingPortalSessionUseCase {
  constructor(
    @inject(TOKENS.IOrganizationService)
    private readonly organizationService: IOrganizationService,
    @inject(TOKENS.IStripeClientService)
    private readonly stripeClientService: IStripeClientService
  ) {}

  async execute(input: CreateBillingPortalSessionInput): Promise<CreateBillingPortalSessionResult> {
    const returnPath = normalizeReturnPath(input.returnPath)
    if (returnPath == null) return { error: "invalid_return_path" }

    const role = await this.organizationService.getMemberRole(input.organizationId, input.actor.id)
    if (role !== "owner" && role !== "admin") return { error: "forbidden" }

    const organization = await this.organizationService.getOrganizationById(input.organizationId)
    if (!organization) return { error: "organization_not_found" }

    const subscription = await this.organizationService.getCurrentSubscription(input.organizationId)
    if (!subscription) return { error: "subscription_not_found" }

    if (subscription.plan_tier === "enterprise") return { error: "enterprise_account" }

    switch (subscription.status) {
      case "active":
      case "trialing":
      case "past_due":
      case "unpaid":
        // `unpaid` and `past_due` both route through the lock screen's
        // `update_billing` recovery intent (see `deriveRecoveryIntent` in
        // `src/application/billing/subscription-gate.ts`). The Portal IS
        // their recovery path — refusing here would leave them deadlocked
        // with no UI affordance to fix their card.
        break
      case "incomplete":
      case "incomplete_expired":
        return { error: "checkout_required" }
      case "canceled":
      case "paused":
        return { error: "restart_subscription" }
      default: {
        // Exhaustiveness guard. `subscription.status` is the DB enum; a new
        // value would land here so on-call notices before Stripe does.
        const unhandled: never = subscription.status
        throw new Error(`Unhandled subscription status: ${unhandled as string}`)
      }
    }

    if (!organization.stripe_customer_id) return { error: "stripe_customer_missing" }

    const stripe = this.stripeClientService.getClient()
    const configurationId = portalConfigurationId()

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: organization.stripe_customer_id,
        return_url: `${appUrl()}${returnPath}`,
        ...(configurationId ? { configuration: configurationId } : {}),
      })
      if (!session.url) return { error: "stripe_portal_unavailable" }
      return { url: session.url }
    } catch {
      return { error: "stripe_portal_unavailable" }
    }
  }
}
