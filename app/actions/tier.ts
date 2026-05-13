"use server"

import { type PlanTier } from "@/src/application/billing/feature-tiers"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

export interface CurrentTierResult {
  tier: PlanTier
  // `requireActiveSubscription` only returns the "allowed" gate
  // variant, so the only statuses that ever reach the caller here
  // are `active` and `trialing`. Past-due / canceled never make it
  // past the gate — they're routed to the recovery flow instead.
  status: "active" | "trialing"
}

/**
 * Tiny read-side action used by the sidebar `<TierIndicator>` to
 * render the current plan + state pill. Returns null-ish state when
 * the actor has no active subscription so the sidebar can fall back
 * to a neutral default rather than showing a misleading "STANDARD".
 *
 * Intentionally NOT gated on `requireFeature` — the indicator must
 * render for every customer including ones whose sub just lapsed.
 * The active-subscription gate is the only thing that runs here so
 * un-onboarded users (no org) get the recovery flow.
 */
export async function getCurrentTierStatus(): Promise<CurrentTierResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const gate = await requireActiveSubscription(actor)
  // `requireActiveSubscription` already throws when no usable sub is
  // present, so by this line we have an allowed gate with the tier
  // and the canonical billing status. The `past_due` / `canceled`
  // mappings used by the UI come from upstream — for now we mirror
  // active/trialing and let the sidebar show only the safe states.
  return {
    tier: gate.planTier,
    status: gate.status,
  }
}
