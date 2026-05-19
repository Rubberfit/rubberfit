/**
 * assertAdvancedNestingAllowed unit tests.
 *
 * Max-tier gate for advanced nesting knobs. Basic pack requests
 * (no tuning fields) must short-circuit without paying for a
 * subscription lookup — that's what keeps the every-tier basic-
 * pack path fast. Knob-bearing requests must delegate to
 * requireFeature("advanced_nesting") so the gate fires for
 * sub-Max tiers.
 */
import { describe, expect, it, vi } from "vitest"

import {
  assertAdvancedNestingAllowed,
  requestUsesAdvancedNesting,
} from "@/app/server/auth/assert-advanced-nesting-allowed"
import type { PackRequest } from "@/src/application/packing/types"
import type { ActionActor } from "@/src/application/types/action-actor"

const requireFeatureMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-feature", () => ({
  requireFeature: requireFeatureMock,
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "owner@example.com",
  roles: ["admin"],
  isSuperAdmin: false,
  activeTenantId: null,
}

function baseRequest(overrides: Partial<PackRequest> = {}): PackRequest {
  return {
    bins: [],
    clearance: 0.125,
    items: [],
    ...overrides,
  } as PackRequest
}

describe("requestUsesAdvancedNesting (pure)", () => {
  it("returns false for a basic request", () => {
    expect(requestUsesAdvancedNesting(baseRequest())).toBe(false)
  })

  it.each([
    ["mode=thorough", baseRequest({ mode: "thorough" })],
    ["timeBudgetMs set", baseRequest({ timeBudgetMs: 30_000 })],
    ["improvementBudgetMs set", baseRequest({ improvementBudgetMs: 5_000 })],
    ["seed set", baseRequest({ seed: 42 })],
  ])("returns true when %s", (_label, req) => {
    expect(requestUsesAdvancedNesting(req)).toBe(true)
  })

  it.each([
    ["mode=fast", baseRequest({ mode: "fast" })],
    ["mode=balanced", baseRequest({ mode: "balanced" })],
    // null-valued knobs are explicit "use default" — not gated.
    ["timeBudgetMs null", baseRequest({ timeBudgetMs: null })],
    ["seed null", baseRequest({ seed: null })],
  ])("returns false when %s", (_label, req) => {
    expect(requestUsesAdvancedNesting(req)).toBe(false)
  })
})

describe("assertAdvancedNestingAllowed", () => {
  it("short-circuits when request uses no advanced knobs (basic pack)", async () => {
    requireFeatureMock.mockClear()
    await assertAdvancedNestingAllowed(ACTOR, baseRequest())
    expect(requireFeatureMock).not.toHaveBeenCalled()
  })

  it("delegates to requireFeature when an advanced knob is set", async () => {
    requireFeatureMock.mockClear()
    requireFeatureMock.mockResolvedValue(undefined)
    await assertAdvancedNestingAllowed(ACTOR, baseRequest({ mode: "thorough" }))
    expect(requireFeatureMock).toHaveBeenCalledWith(ACTOR, "advanced_nesting")
  })

  it("propagates FeatureLockedError for sub-Max tiers", async () => {
    requireFeatureMock.mockClear()
    requireFeatureMock.mockRejectedValue(
      Object.assign(new Error("locked"), {
        code: "FEATURE_LOCKED",
        featureKey: "advanced_nesting",
        requiredTier: "max",
        currentTier: "pro",
      })
    )
    await expect(
      assertAdvancedNestingAllowed(ACTOR, baseRequest({ seed: 7 }))
    ).rejects.toMatchObject({
      code: "FEATURE_LOCKED",
      featureKey: "advanced_nesting",
    })
  })
})
