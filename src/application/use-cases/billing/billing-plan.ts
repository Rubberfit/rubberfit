import type { BillingInterval, PlanTier } from "@/src/infrastructure/models/billing"

export type CheckoutPlanTier = "standard" | "pro" | "max"
export type CheckoutBillingInterval = "monthly" | "annual"

export function isCheckoutPlanTier(value: PlanTier): value is CheckoutPlanTier {
  return value === "standard" || value === "pro" || value === "max"
}

/**
 * Display-only pricing table for the per-seat amount shown on the Team tab
 * seat-meter and seat-bump dialog. Annual is the discounted per-month rate
 * (`annual_price_per_year / 12`). Mirrors `rubberfit-marketing/.../pricing/page.tsx`.
 *
 * Enterprise is mailto-only with no Stripe Price; the helper returns 0 so the
 * UI can decide to hide the cost column for that tier.
 */
export interface PlanPricing {
  pricePerSeatPerMonth: number
  currency: "USD"
}

const PRICING: Record<CheckoutPlanTier, Record<CheckoutBillingInterval, number>> = {
  standard: { monthly: 199, annual: 159 },
  pro: { monthly: 349, annual: 279 },
  max: { monthly: 699, annual: 559 },
}

export function getPlanPricing(
  planTier: PlanTier,
  billingInterval: BillingInterval | null
): PlanPricing {
  if (!isCheckoutPlanTier(planTier) || !billingInterval) {
    return { pricePerSeatPerMonth: 0, currency: "USD" }
  }
  const interval: CheckoutBillingInterval = billingInterval === "annual" ? "annual" : "monthly"
  return { pricePerSeatPerMonth: PRICING[planTier][interval], currency: "USD" }
}
