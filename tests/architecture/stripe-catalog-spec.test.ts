/**
 * PR 2 architecture guard — Stripe catalog spec.
 *
 * Verifies the `scripts/stripe-catalog.mjs` source-of-truth file is
 * internally consistent. The script that talks to Stripe imports the
 * same module; these assertions guarantee that whatever the script
 * pushes upstream matches what downstream PRs (lookup_key resolution
 * in PR 4's Checkout flow, plan_tier inference in PR 5's gate) will
 * expect to read back.
 *
 * Does NOT call the Stripe API — pure spec validation.
 */
import { describe, it, expect } from "vitest"

// Static import via dynamic-await is needed because Vitest's ESM
// resolver doesn't follow .mjs through pure named-imports in all
// configs. The catalog module is plain ESM with no side effects.
import * as catalog from "../../scripts/stripe-catalog.mjs"

type PriceSpec = {
  lookupKey: string
  unitAmount: number
  interval: "month" | "year"
  intervalCount: number
  nickname: string
}

type ProductSpec = {
  tier: "standard" | "pro" | "max" | "enterprise"
  name: string
  description: string
  statementDescriptor: string
  prices: PriceSpec[]
}

const PRODUCT_KEY = catalog.PRODUCT_KEY as string
const CATALOG_VERSION = catalog.CATALOG_VERSION as string
const PRODUCTS = catalog.PRODUCTS as ProductSpec[]

// Marketing page prices that the catalog must match exactly. Pulled
// from `rubberfit-marketing/src/app/pricing/page.tsx` 2026-05-12.
const EXPECTED_MARKETING_PRICES: Record<
  Exclude<ProductSpec["tier"], "enterprise">,
  { monthly: number; annualPerMonth: number }
> = {
  standard: { monthly: 199, annualPerMonth: 159 },
  pro: { monthly: 349, annualPerMonth: 279 },
  max: { monthly: 699, annualPerMonth: 559 },
}

describe("PR 2 — Stripe catalog spec", () => {
  it("exports a catalog_version stamp", () => {
    expect(CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("uses 'rubberfit' as the product key for cross-product Reports filtering", () => {
    expect(PRODUCT_KEY).toBe("rubberfit")
  })

  it("declares exactly four tiers: standard, pro, max, enterprise", () => {
    const tiers = PRODUCTS.map((p) => p.tier).sort()
    expect(tiers).toEqual(["enterprise", "max", "pro", "standard"])
  })

  it("declares two prices per paid tier (monthly + annual) and zero for enterprise", () => {
    for (const product of PRODUCTS) {
      if (product.tier === "enterprise") {
        expect(product.prices, `enterprise must have no prices`).toHaveLength(0)
      } else {
        expect(
          product.prices,
          `${product.tier} must declare exactly 2 prices (monthly + annual)`
        ).toHaveLength(2)
      }
    }
  })

  it("lookup_keys follow rubberfit.<tier>.<monthly|annual>.v<N> shape", () => {
    const validShape = /^rubberfit\.(standard|pro|max)\.(monthly|annual)\.v\d+$/
    for (const product of PRODUCTS) {
      for (const price of product.prices) {
        expect(price.lookupKey, `bad lookup_key ${price.lookupKey}`).toMatch(validShape)
        expect(price.lookupKey, `lookup_key ${price.lookupKey} must reference tier ${product.tier}`)
          .toContain(`.${product.tier}.`)
      }
    }
  })

  it("lookup_keys are globally unique within the catalog", () => {
    const allKeys = PRODUCTS.flatMap((p) => p.prices.map((pr) => pr.lookupKey))
    const unique = new Set(allKeys)
    expect(unique.size).toBe(allKeys.length)
  })

  it("paid-tier unit amounts match the marketing /pricing page (cents)", () => {
    for (const product of PRODUCTS) {
      if (product.tier === "enterprise") continue
      const expected = EXPECTED_MARKETING_PRICES[product.tier]
      const monthly = product.prices.find((p) => p.interval === "month")
      const annual = product.prices.find((p) => p.interval === "year")

      expect(monthly?.unitAmount, `${product.tier} monthly must be ${expected.monthly}`).toBe(
        expected.monthly * 100
      )
      // Annual price = annual_per_month × 12 (in cents)
      expect(annual?.unitAmount, `${product.tier} annual must be ${expected.annualPerMonth}×12`).toBe(
        expected.annualPerMonth * 12 * 100
      )
    }
  })

  it("annual recurring uses interval=year, intervalCount=1", () => {
    for (const product of PRODUCTS) {
      const annual = product.prices.find((p) => p.interval === "year")
      if (!annual) continue
      expect(annual.intervalCount).toBe(1)
    }
  })

  it("monthly recurring uses interval=month, intervalCount=1", () => {
    for (const product of PRODUCTS) {
      const monthly = product.prices.find((p) => p.interval === "month")
      if (!monthly) continue
      expect(monthly.intervalCount).toBe(1)
    }
  })

  it("every product declares a statement descriptor (Stripe receipts)", () => {
    for (const product of PRODUCTS) {
      expect(product.statementDescriptor, `${product.tier} missing statement_descriptor`).toBeTruthy()
      expect(product.statementDescriptor.length).toBeLessThanOrEqual(22) // Stripe limit
    }
  })

  it("every price declares a human-readable nickname (Stripe Dashboard reports)", () => {
    for (const product of PRODUCTS) {
      for (const price of product.prices) {
        expect(price.nickname, `${price.lookupKey} missing nickname`).toBeTruthy()
      }
    }
  })

  it("contains the six lookup_keys downstream PRs will resolve at runtime", () => {
    const allKeys = PRODUCTS.flatMap((p) => p.prices.map((pr) => pr.lookupKey)).sort()
    expect(allKeys).toEqual([
      "rubberfit.max.annual.v1",
      "rubberfit.max.monthly.v1",
      "rubberfit.pro.annual.v1",
      "rubberfit.pro.monthly.v1",
      "rubberfit.standard.annual.v1",
      "rubberfit.standard.monthly.v1",
    ])
  })
})
