import type { PlanTier } from "@/src/infrastructure/models/billing"

export type CheckoutPlanTier = "standard" | "pro" | "max"
export type CheckoutBillingInterval = "monthly" | "annual"

export function isCheckoutPlanTier(value: PlanTier): value is CheckoutPlanTier {
  return value === "standard" || value === "pro" || value === "max"
}
