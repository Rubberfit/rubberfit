import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"

vi.mock("@/src/infrastructure/services/organizationBillingService", () => ({
  getSubscriptionGateForActor: vi.fn(),
}))

const ACTOR: ActionActor = {
  id: "user_test",
  email: "owner@example.com",
  roles: ["admin"],
  isSuperAdmin: false,
}

async function importHelpers() {
  const billingMod = await import("@/src/infrastructure/services/organizationBillingService")
  const featureMod = await import("@/app/server/auth/require-feature")
  const subMod = await import("@/app/server/auth/require-active-subscription")
  return {
    getSubscriptionGateForActorMock: billingMod.getSubscriptionGateForActor as ReturnType<
      typeof vi.fn
    >,
    requireFeature: featureMod.requireFeature,
    FeatureLockedError: featureMod.FeatureLockedError,
    SubscriptionRequiredError: subMod.SubscriptionRequiredError,
  }
}

function allowedGate(
  planTier: "standard" | "pro" | "max" | "enterprise",
  status: "active" | "trialing" = "active"
) {
  return {
    kind: "allowed" as const,
    organizationId: "org_1",
    subscriptionId: "sub_1",
    status,
    planTier,
    cancelAtPeriodEnd: false,
    cancelAt: null,
    currentPeriodEnd: null,
  }
}

describe("requireFeature", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("passes when actor's tier meets the feature requirement", async () => {
    const { getSubscriptionGateForActorMock, requireFeature } = await importHelpers()
    getSubscriptionGateForActorMock.mockResolvedValue(allowedGate("pro"))

    await expect(requireFeature(ACTOR, "analytics_waste")).resolves.toBeUndefined()
  })

  it("passes when actor's tier exceeds the feature requirement", async () => {
    const { getSubscriptionGateForActorMock, requireFeature } = await importHelpers()
    getSubscriptionGateForActorMock.mockResolvedValue(allowedGate("max"))

    await expect(requireFeature(ACTOR, "analytics_waste")).resolves.toBeUndefined()
  })

  it("enterprise bypasses all feature gates", async () => {
    const { getSubscriptionGateForActorMock, requireFeature } = await importHelpers()
    getSubscriptionGateForActorMock.mockResolvedValue(allowedGate("enterprise"))

    await expect(requireFeature(ACTOR, "full_crm")).resolves.toBeUndefined()
    await expect(requireFeature(ACTOR, "ai_planner")).resolves.toBeUndefined()
    await expect(requireFeature(ACTOR, "analytics_reports")).resolves.toBeUndefined()
  })

  it("throws FeatureLockedError when actor's tier is below requirement", async () => {
    const { getSubscriptionGateForActorMock, requireFeature, FeatureLockedError } =
      await importHelpers()
    getSubscriptionGateForActorMock.mockResolvedValue(allowedGate("standard"))

    await expect(requireFeature(ACTOR, "analytics_waste")).rejects.toMatchObject({
      code: "FEATURE_LOCKED",
      featureKey: "analytics_waste",
      requiredTier: "pro",
      currentTier: "standard",
    })
    await expect(requireFeature(ACTOR, "analytics_waste")).rejects.toBeInstanceOf(
      FeatureLockedError
    )
  })

  it("promotes a trialing Standard customer to effective Pro (Codex sign-off)", async () => {
    const { getSubscriptionGateForActorMock, requireFeature } = await importHelpers()
    getSubscriptionGateForActorMock.mockResolvedValue(allowedGate("standard", "trialing"))

    // analytics_waste is a Pro feature — trialing Standard now passes.
    await expect(requireFeature(ACTOR, "analytics_waste")).resolves.toBeUndefined()
  })

  it("does NOT promote trialing Pro/Max — they keep their stored tier", async () => {
    const { getSubscriptionGateForActorMock, requireFeature, FeatureLockedError } =
      await importHelpers()
    // Trialing Pro must still be locked from Max features.
    getSubscriptionGateForActorMock.mockResolvedValue(allowedGate("pro", "trialing"))
    await expect(requireFeature(ACTOR, "full_crm")).rejects.toBeInstanceOf(FeatureLockedError)
  })

  it("propagates SubscriptionRequiredError when actor has no active subscription", async () => {
    const { getSubscriptionGateForActorMock, requireFeature, SubscriptionRequiredError } =
      await importHelpers()
    getSubscriptionGateForActorMock.mockResolvedValue({
      kind: "blocked",
      organizationId: "org_1",
      status: "past_due",
      recovery: "update_billing",
    })

    await expect(requireFeature(ACTOR, "analytics_waste")).rejects.toBeInstanceOf(
      SubscriptionRequiredError
    )
  })
})

describe("FeatureLockedError", () => {
  it("carries discriminant code and feature context for RPC boundary", async () => {
    const { FeatureLockedError } = await importHelpers()
    const err = new FeatureLockedError({
      featureKey: "branded_pdfs",
      requiredTier: "pro",
      currentTier: "standard",
    })
    expect(err.code).toBe("FEATURE_LOCKED")
    expect(err.featureKey).toBe("branded_pdfs")
    expect(err.requiredTier).toBe("pro")
    expect(err.currentTier).toBe("standard")
    expect(err.name).toBe("FeatureLockedError")
  })
})
