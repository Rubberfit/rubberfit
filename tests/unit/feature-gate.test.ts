import { describe, expect, it } from "vitest"

import { FEATURE_TIERS, type FeatureKey } from "@/src/application/billing/feature-tiers"
import { getRequiredFeature } from "@/src/middleware/feature-gate"

describe("getRequiredFeature", () => {
  it("returns null for the dashboard root and other ungated paths", () => {
    expect(getRequiredFeature("/dashboard")).toBeNull()
    expect(getRequiredFeature("/dashboard/inventory")).toBeNull()
    expect(getRequiredFeature("/dashboard/jobs")).toBeNull()
    expect(getRequiredFeature("/dashboard/cutting-engine")).toBeNull()
    expect(getRequiredFeature("/dashboard/history")).toBeNull()
    expect(getRequiredFeature("/dashboard/notifications")).toBeNull()
    expect(getRequiredFeature("/dashboard/users")).toBeNull()
    expect(getRequiredFeature("/dashboard/settings")).toBeNull()
    expect(getRequiredFeature("/api/cuts/history")).toBeNull()
  })

  it.each([
    ["/dashboard/analytics", "analytics_waste"],
    ["/dashboard/analytics/", "analytics_waste"],
    ["/dashboard/analytics/waste", "analytics_waste"],
    ["/dashboard/analytics/waste-comparison", "analytics_waste"],
    ["/dashboard/analytics/costs", "analytics_costs"],
    ["/dashboard/analytics/trends", "analytics_trends"],
    ["/dashboard/analytics/usage", "analytics_usage"],
    ["/dashboard/analytics/reports", "analytics_reports"],
    ["/api/analytics/cut-history", "analytics_waste"],
    ["/dashboard/inventory/materials/pricing", "supplier_price_history"],
  ] as Array<[string, FeatureKey]>)("gates %s on %s", (pathname, expected) => {
    expect(getRequiredFeature(pathname)).toBe(expected)
  })

  it("returns FeatureKey values that exist in FEATURE_TIERS — no orphan keys", () => {
    const probePaths = [
      "/dashboard/analytics",
      "/dashboard/analytics/waste",
      "/dashboard/analytics/costs",
      "/dashboard/analytics/trends",
      "/dashboard/analytics/usage",
      "/dashboard/analytics/reports",
      "/api/analytics/cut-history",
      "/dashboard/inventory/materials/pricing",
    ]
    for (const p of probePaths) {
      const key = getRequiredFeature(p)
      expect(key).not.toBeNull()
      if (key !== null) {
        expect(FEATURE_TIERS[key]).toBeDefined()
      }
    }
  })

  it("does not gate path-prefix-overlap routes (no path-segment boundary)", () => {
    // A future `/dashboard/analyticsosaurus` route must not be
    // mis-gated by the `/dashboard/analytics` index entry. Same for
    // `/dashboard/inventory/materials/pricinghub` — the implementation
    // requires either exact match or a `/` boundary.
    expect(getRequiredFeature("/dashboard/analyticsosaurus")).toBeNull()
    expect(getRequiredFeature("/dashboard/inventory/materials/pricinghub")).toBeNull()
    expect(getRequiredFeature("/api/analyticsfoo")).toBeNull()
  })

  it("gates subpaths under a prefix-matched gate", () => {
    // The proxy passes `request.nextUrl.pathname` which never includes
    // a query string, so we only need to assert pathname matching here.
    expect(getRequiredFeature("/dashboard/analytics/waste/2024")).toBe("analytics_waste")
    expect(getRequiredFeature("/dashboard/inventory/materials/pricing/historical")).toBe(
      "supplier_price_history"
    )
    expect(getRequiredFeature("/api/analytics/cut-history")).toBe("analytics_waste")
  })
})
