import { describe, expect, it } from "vitest"

import { UpdateSubscriptionSeatCountUseCase } from "@/src/application/use-cases/billing/update-subscription-seat-count.use-case"

import {
  ACTOR_OWNER,
  ORG_ID,
  makeFakeOrganizationService,
  makeFakeStripeClient,
  makeSeatUsage,
  makeSubscription,
} from "./_fixtures"

describe("UpdateSubscriptionSeatCountUseCase", () => {
  it("updates Stripe with proration and optimistically writes the local seat_count", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      subscription: makeSubscription({ seat_count: 5 }),
      seatUsage: makeSeatUsage({ purchased: 5, used: 3, available: 2 }),
    })
    const { service, updateSubscription } = makeFakeStripeClient()
    const useCase = new UpdateSubscriptionSeatCountUseCase(fakeOrg, service)

    const result = await useCase.execute({
      organizationId: ORG_ID,
      newSeatCount: 7,
      actor: ACTOR_OWNER,
    })

    expect(result).toEqual({ ok: true, newSeatCount: 7 })
    expect(updateSubscription).toHaveBeenCalledWith("sub_test_123", {
      items: [{ id: "si_test_123", quantity: 7 }],
      proration_behavior: "create_prorations",
    })
    expect(fakeOrg.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
        stripe_subscription_id: "sub_test_123",
        seat_count: 7,
        is_current: true,
      })
    )
  })

  it("returns forbidden for non-admin caller", async () => {
    const fakeOrg = makeFakeOrganizationService({ role: "member" })
    const { service } = makeFakeStripeClient()
    const useCase = new UpdateSubscriptionSeatCountUseCase(fakeOrg, service)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      newSeatCount: 7,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "forbidden" })
  })

  it.each([0, -1, 501, 7.5])("rejects seat_count %s", async (seatCount) => {
    const fakeOrg = makeFakeOrganizationService({ role: "owner" })
    const { service } = makeFakeStripeClient()
    const useCase = new UpdateSubscriptionSeatCountUseCase(fakeOrg, service)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      newSeatCount: seatCount,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "seat_count_out_of_range" })
  })

  it("returns subscription_not_found when there is no current subscription", async () => {
    const fakeOrg = makeFakeOrganizationService({ role: "owner", subscription: null })
    const { service } = makeFakeStripeClient()
    const useCase = new UpdateSubscriptionSeatCountUseCase(fakeOrg, service)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      newSeatCount: 7,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "subscription_not_found" })
  })

  it("blocks downsize below used and reports current used count", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      subscription: makeSubscription({ seat_count: 5 }),
      seatUsage: makeSeatUsage({ purchased: 5, used: 4, available: 1 }),
    })
    const { service, updateSubscription } = makeFakeStripeClient()
    const useCase = new UpdateSubscriptionSeatCountUseCase(fakeOrg, service)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      newSeatCount: 3,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "cannot_downsize_below_used", used: 4 })
    expect(updateSubscription).not.toHaveBeenCalled()
  })

  it("returns subscription_inactive when sub is past_due", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      subscription: makeSubscription({ status: "past_due" }),
    })
    const { service } = makeFakeStripeClient()
    const useCase = new UpdateSubscriptionSeatCountUseCase(fakeOrg, service)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      newSeatCount: 7,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "subscription_inactive" })
  })

  it("returns stripe_subscription_missing when stripe_subscription_id is null", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      subscription: makeSubscription({ stripe_subscription_id: null }),
    })
    const { service } = makeFakeStripeClient()
    const useCase = new UpdateSubscriptionSeatCountUseCase(fakeOrg, service)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      newSeatCount: 7,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "stripe_subscription_missing" })
  })

  it("returns stripe_subscription_item_missing when item id is null", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      subscription: makeSubscription({ stripe_subscription_item_id: null }),
    })
    const { service } = makeFakeStripeClient()
    const useCase = new UpdateSubscriptionSeatCountUseCase(fakeOrg, service)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      newSeatCount: 7,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "stripe_subscription_item_missing" })
  })

  it("does not write local seat_count when Stripe call fails", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      subscription: makeSubscription(),
    })
    const { service, updateSubscription } = makeFakeStripeClient()
    updateSubscription.mockRejectedValueOnce(new Error("stripe down"))
    const useCase = new UpdateSubscriptionSeatCountUseCase(fakeOrg, service)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      newSeatCount: 7,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "stripe_update_failed" })
    expect(fakeOrg.upsertSubscription).not.toHaveBeenCalled()
  })
})
