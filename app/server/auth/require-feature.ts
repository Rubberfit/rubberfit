import {
  FEATURE_TIERS,
  meetsFeatureTier,
  type FeatureKey,
  type PlanTier,
} from "@/src/application/billing/feature-tiers"
import { getEffectiveTier } from "@/src/application/billing/effective-tier"
import type { ActionActor } from "@/src/application/types/action-actor"

import { requireActiveSubscription } from "./require-active-subscription"

/**
 * Thrown when an authenticated, billing-allowed actor lacks the tier
 * required for a specific feature. Distinct from `SubscriptionRequiredError`
 * (no active subscription) and `ForbiddenError` (RBAC) so callers can
 * render the Kimi-designed upgrade UI instead of a generic 403.
 *
 * Carries the feature key + required tier + current tier on the wire
 * so the UI can build a precise upsell prompt without re-querying.
 */
export class FeatureLockedError extends Error {
  readonly code = "FEATURE_LOCKED" as const
  readonly featureKey: FeatureKey
  readonly requiredTier: PlanTier
  readonly currentTier: PlanTier

  constructor(params: { featureKey: FeatureKey; requiredTier: PlanTier; currentTier: PlanTier }) {
    super(
      `Feature "${params.featureKey}" requires ${params.requiredTier} (current: ${params.currentTier})`
    )
    this.name = "FeatureLockedError"
    this.featureKey = params.featureKey
    this.requiredTier = params.requiredTier
    this.currentTier = params.currentTier
  }
}

/**
 * Enforce that the actor's effective plan tier meets the minimum tier
 * required by a feature. Must be called AFTER `requireAuthenticatedUser`
 * and `requirePermission` — those checks are cheaper and produce more
 * actionable errors when the caller has no session at all.
 *
 * `requireActiveSubscription` runs first; if no active sub exists the
 * caller already needs the recovery flow, not an upgrade prompt. The
 * tier check then runs against the effective tier (trial promotes
 * Standard to Pro per `getEffectiveTier`, never demotes), so a trialing
 * Standard customer sees Pro features during the trial window without
 * mutating `organization_subscriptions.plan_tier`.
 */
export async function requireFeature(actor: ActionActor, feature: FeatureKey): Promise<void> {
  const gate = await requireActiveSubscription(actor)
  const currentTier = getEffectiveTier(gate.planTier, gate.status)
  if (!meetsFeatureTier(currentTier, feature)) {
    throw new FeatureLockedError({
      featureKey: feature,
      requiredTier: FEATURE_TIERS[feature],
      currentTier,
    })
  }
}
