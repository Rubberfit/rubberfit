import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"

const getSubscriptionGateForActorMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/organizationBillingService", () => ({
  getSubscriptionGateForActor: getSubscriptionGateForActorMock,
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@example.com",
  roles: ["admin"],
  isSuperAdmin: false,
}

describe("requireActiveSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the allowed gate result", async () => {
    const allowed = {
      kind: "allowed" as const,
      organizationId: "org_1",
      subscriptionId: "sub_1",
      status: "active" as const,
      planTier: "standard" as const,
      cancelAtPeriodEnd: false,
      cancelAt: null,
      currentPeriodEnd: null,
    }
    getSubscriptionGateForActorMock.mockResolvedValue(allowed)

    const { requireActiveSubscription } = await import(
      "@/app/server/auth/require-active-subscription"
    )

    await expect(requireActiveSubscription(ACTOR)).resolves.toBe(allowed)
    expect(getSubscriptionGateForActorMock).toHaveBeenCalledWith(ACTOR)
  })

  it("throws SubscriptionRequiredError for blocked subscriptions", async () => {
    getSubscriptionGateForActorMock.mockResolvedValue({
      kind: "blocked",
      organizationId: "org_1",
      status: "past_due",
      recovery: "update_billing",
    })

    const { requireActiveSubscription, SubscriptionRequiredError } = await import(
      "@/app/server/auth/require-active-subscription"
    )

    await expect(requireActiveSubscription(ACTOR)).rejects.toMatchObject({
      code: "NO_ACTIVE_SUBSCRIPTION",
      recovery: "update_billing",
      organizationId: "org_1",
    })
    await expect(requireActiveSubscription(ACTOR)).rejects.toBeInstanceOf(
      SubscriptionRequiredError
    )
  })

  it("throws SubscriptionRequiredError for users without a workspace", async () => {
    getSubscriptionGateForActorMock.mockResolvedValue({ kind: "needs_workspace" })

    const { requireActiveSubscription } = await import(
      "@/app/server/auth/require-active-subscription"
    )

    await expect(requireActiveSubscription(ACTOR)).rejects.toMatchObject({
      code: "NO_ACTIVE_SUBSCRIPTION",
      recovery: "needs_workspace",
      organizationId: null,
    })
  })
})
