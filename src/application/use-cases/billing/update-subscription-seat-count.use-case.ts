import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type { IStripeClientService } from "@/src/application/services/stripe-client.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"

export type UpdateSubscriptionSeatCountError =
  | "forbidden"
  | "seat_count_out_of_range"
  | "subscription_not_found"
  | "subscription_inactive"
  | "stripe_subscription_missing"
  | "stripe_subscription_item_missing"
  | "cannot_downsize_below_used"
  | "stripe_update_failed"

const MIN_SEATS = 1
const MAX_SEATS = 500

export interface UpdateSubscriptionSeatCountInput {
  organizationId: string
  newSeatCount: number
  actor: ActionActor
}

export type UpdateSubscriptionSeatCountResult =
  | { ok: true; newSeatCount: number }
  | { error: UpdateSubscriptionSeatCountError; used?: number }

export interface IUpdateSubscriptionSeatCountUseCase {
  execute(input: UpdateSubscriptionSeatCountInput): Promise<UpdateSubscriptionSeatCountResult>
}

@injectable()
export class UpdateSubscriptionSeatCountUseCase implements IUpdateSubscriptionSeatCountUseCase {
  constructor(
    @inject(TOKENS.IOrganizationService)
    private readonly organizationService: IOrganizationService,
    @inject(TOKENS.IStripeClientService)
    private readonly stripeClientService: IStripeClientService
  ) {}

  async execute(
    input: UpdateSubscriptionSeatCountInput
  ): Promise<UpdateSubscriptionSeatCountResult> {
    const actorRole = await this.organizationService.getMemberRole(
      input.organizationId,
      input.actor.id
    )
    if (actorRole !== "owner" && actorRole !== "admin") return { error: "forbidden" }

    if (
      !Number.isInteger(input.newSeatCount) ||
      input.newSeatCount < MIN_SEATS ||
      input.newSeatCount > MAX_SEATS
    ) {
      return { error: "seat_count_out_of_range" }
    }

    const subscription = await this.organizationService.getCurrentSubscription(input.organizationId)
    if (!subscription) return { error: "subscription_not_found" }
    if (subscription.status !== "active" && subscription.status !== "trialing") {
      return { error: "subscription_inactive" }
    }
    if (!subscription.stripe_subscription_id) return { error: "stripe_subscription_missing" }
    if (!subscription.stripe_subscription_item_id) {
      return { error: "stripe_subscription_item_missing" }
    }

    const usage = await this.organizationService.getSeatUsage(input.organizationId)
    if (input.newSeatCount < usage.used) {
      return { error: "cannot_downsize_below_used", used: usage.used }
    }
    // TOCTOU window: a concurrent invite-accept between this read and the
    // Stripe call below can push `used` above `newSeatCount`. The Stripe
    // quantity still commits, so the org ends up technically over-allocated
    // until the next seat-count change. Tracked as a PR 6 follow-up — fix
    // is either an FOR UPDATE lock inside an accept+update Postgres RPC,
    // or a post-Stripe compensating bump. Mitigation deferred because
    // (a) the window is narrow, and (b) over-allocation is the safe-failure
    // direction (the app keeps working; only the next downsize is needed).

    const stripe = this.stripeClientService.getClient()
    try {
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        items: [
          {
            id: subscription.stripe_subscription_item_id,
            quantity: input.newSeatCount,
          },
        ],
        proration_behavior: "create_prorations",
      })
    } catch {
      return { error: "stripe_update_failed" }
    }

    // Optimistic write — the webhook remains source of truth and will
    // confirm/overwrite via customer.subscription.updated.
    await this.organizationService.upsertSubscription({
      organization_id: input.organizationId,
      stripe_subscription_id: subscription.stripe_subscription_id,
      seat_count: input.newSeatCount,
      is_current: true,
    })

    return { ok: true, newSeatCount: input.newSeatCount }
  }
}
