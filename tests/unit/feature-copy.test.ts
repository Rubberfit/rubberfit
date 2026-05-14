import { describe, expect, it } from "vitest"

import {
  FEATURE_COPY,
  TIER_META,
  getMissingFeatures,
} from "@/app/dashboard/locked/_lib/feature-copy"
import { FEATURE_TIERS, type FeatureKey } from "@/src/application/billing/feature-tiers"

describe("FEATURE_COPY", () => {
  it("has a copy entry for every FeatureKey", () => {
    const featureKeys = Object.keys(FEATURE_TIERS) as FeatureKey[]
    for (const key of featureKeys) {
      expect(FEATURE_COPY[key], `missing FEATURE_COPY for ${key}`).toBeDefined()
      expect(FEATURE_COPY[key].label).toBeTruthy()
      expect(FEATURE_COPY[key].category).toBeTruthy()
      expect(FEATURE_COPY[key].pathLabel).toMatch(/^\/[A-Z-]+$/)
    }
  })

  it("has no orphan copy entries (no copy without a feature)", () => {
    const featureKeys = new Set(Object.keys(FEATURE_TIERS))
    for (const copyKey of Object.keys(FEATURE_COPY)) {
      expect(featureKeys.has(copyKey), `orphan FEATURE_COPY entry: ${copyKey}`).toBe(true)
    }
  })
})

describe("TIER_META", () => {
  it("covers every PlanTier", () => {
    expect(TIER_META.standard).toBeDefined()
    expect(TIER_META.pro).toBeDefined()
    expect(TIER_META.max).toBeDefined()
    expect(TIER_META.enterprise).toBeDefined()
  })

  it("uses the founder-locked tier prices verbatim", () => {
    // The marketing pricing page and the FEATURE_TIERS phase-plan
    // both anchor on these exact strings. Drift = customer confusion.
    expect(TIER_META.standard.price).toBe("$199/mo")
    expect(TIER_META.pro.price).toBe("$349/mo")
    expect(TIER_META.max.price).toBe("$699/mo")
    expect(TIER_META.enterprise.price).toBe("Custom")
  })
})

describe("getMissingFeatures", () => {
  it("returns features at the required tier that the current tier doesn't have", () => {
    const { items } = getMissingFeatures("standard", "pro")
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(5)
    // Standard upgrading to Pro should see Pro features in the list.
    expect(items.some((item) => item.toLowerCase().includes("analytics"))).toBe(true)
  })

  it("caps the displayed items at 5 and reports overflow", () => {
    const proFeatureCount = Object.values(FEATURE_TIERS).filter((t) => t === "pro").length
    const { items, overflow } = getMissingFeatures("standard", "pro")
    if (proFeatureCount > 5) {
      expect(items).toHaveLength(5)
      expect(overflow).toBe(proFeatureCount - 5)
    } else {
      expect(items).toHaveLength(proFeatureCount)
      expect(overflow).toBe(0)
    }
  })

  it("returns Max features when current=Pro and required=Max", () => {
    const { items } = getMissingFeatures("pro", "max")
    expect(items.some((item) => item.toLowerCase().includes("crm"))).toBe(true)
  })
})
