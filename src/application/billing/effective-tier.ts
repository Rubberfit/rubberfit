import type { BillingStatus } from "./subscription-gate"
import { TIER_RANK, type PlanTier } from "./feature-tiers"

/**
 * Computed effective tier for entitlement checks.
 *
 * Trial sessions get at minimum Pro access regardless of the stored
 * `plan_tier`. Rationale: the trial demonstrates the upgrade value
 * without giving away CRM/AI economics on a card-upfront 14-day window.
 * A trial customer who selected Max during checkout still gets Max —
 * trial promotes Standard, never demotes a higher tier.
 *
 * Mutating `plan_tier` during trial would corrupt the historical audit
 * trail in `organization_subscriptions`, so the computation lives here,
 * not on the DB row.
 *
 * Enterprise always returns as-is — it bypasses tier gates by design.
 *
 * Non-allowed statuses (past_due, canceled, etc.) never reach this
 * helper — `requireActiveSubscription` blocks them upstream.
 */
export function getEffectiveTier(storedTier: PlanTier, status: BillingStatus): PlanTier {
  if (storedTier === "enterprise") return "enterprise"
  if (status === "trialing" && TIER_RANK[storedTier] < TIER_RANK["pro"]) return "pro"
  return storedTier
}
