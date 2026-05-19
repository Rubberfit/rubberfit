import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const REPO_ROOT = path.resolve(__dirname, "../..")
const PROXY_PATH = path.join(REPO_ROOT, "proxy.ts")

function readProxy(): string {
  return fs.readFileSync(PROXY_PATH, "utf8")
}

describe("proxy feature gate", () => {
  it("imports the feature-gate helper + tier utilities", () => {
    const source = readProxy()
    expect(source).toContain("@/src/middleware/feature-gate")
    expect(source).toContain("getRequiredFeature")
    expect(source).toContain("@/src/application/billing/feature-tiers")
    expect(source).toContain("meetsFeatureTier")
    expect(source).toContain("@/src/application/billing/effective-tier")
    expect(source).toContain("getEffectiveTier")
  })

  it("runs the feature gate ONLY after the subscription gate passes", () => {
    const source = readProxy()
    const subscriptionGateIndex = source.indexOf("getSubscriptionGateForUser(supabase, user.id)")
    const featureGateIndex = source.indexOf("getRequiredFeature(pathname)")

    expect(subscriptionGateIndex).toBeGreaterThan(0)
    expect(featureGateIndex).toBeGreaterThan(subscriptionGateIndex)
  })

  it("rewrites (does not redirect) HTML feature-locked responses to /dashboard/locked", () => {
    const source = readProxy()
    expect(source).toContain('new URL("/dashboard/locked"')
    expect(source).toContain("NextResponse.rewrite(lockedUrl)")
    // Rewrite preserves URL bar — must NOT redirect.
    expect(source).not.toMatch(/feature.*locked[\s\S]{0,200}NextResponse\.redirect/)
  })

  it("returns 403 JSON with FEATURE_LOCKED code for API feature-locked responses", () => {
    const source = readProxy()
    expect(source).toMatch(/buildFeatureLockedResponse[\s\S]*FEATURE_LOCKED[\s\S]*status: 403/)
  })

  it("carries featureKey + requiredTier + currentTier in both responses", () => {
    const source = readProxy()
    expect(source).toContain("context.featureKey")
    expect(source).toContain("context.requiredTier")
    expect(source).toContain("context.currentTier")
  })

  it("evaluates effective tier (trial-aware) — not raw plan_tier", () => {
    const source = readProxy()
    expect(source).toMatch(/getEffectiveTier\(\s*gate\.planTier\s*,\s*gate\.status\s*\)/)
  })
})
