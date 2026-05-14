/**
 * Per-tier feature entitlement map.
 *
 * Mirrors `rubberfit-marketing/src/app/pricing/page.tsx` — that page is the
 * canonical scope. A customer must never see a feature in the pricing list
 * they can't access in-app, and vice versa. When the marketing copy shifts,
 * this map shifts in lockstep.
 *
 * Tier semantics:
 *   - standard: operational floor (nesting + jobs + customer PDFs + barcode + RBAC)
 *   - pro: manager visibility upgrades (analytics + exports + branded PDFs)
 *   - max: full business stack (CRM + AI planner + multi-shop)
 *   - enterprise: bypasses all gates (manually provisioned, fixed-rate)
 *
 * Customer-success policies (priority_support, phone_support) are NOT in
 * this map — they aren't app entitlements. They live in the marketing copy
 * and the support runbook.
 */

export type PlanTier = "standard" | "pro" | "max" | "enterprise"

export const TIER_RANK: Record<PlanTier, number> = {
  standard: 0,
  pro: 1,
  max: 2,
  enterprise: 3,
}

export const FEATURE_TIERS = {
  // Standard ($199) — operational floor
  auto_nest: "standard",
  free_roam: "standard",
  roll_lineage: "standard",
  first_class_offcuts: "standard",
  job_lifecycle: "standard",
  job_customer_pdfs: "standard",
  barcode_receiving: "standard",
  barcode_scanning: "standard",
  in_app_notifications: "standard",
  rbac_six_role: "standard",

  // Pro ($349) — manager visibility
  analytics_waste: "pro",
  analytics_costs: "pro",
  analytics_trends: "pro",
  analytics_usage: "pro",
  analytics_reports: "pro",
  cut_history_exports: "pro",
  supplier_price_history: "pro",
  branded_pdfs: "pro",
  custom_barcode_formats: "pro",

  // Max ($699) — full business stack
  full_crm: "max",
  ai_planner: "max",
  advanced_nesting: "max",
  multi_shop: "max",
  cross_team_scheduling: "max",
} as const satisfies Record<string, PlanTier>

export type FeatureKey = keyof typeof FEATURE_TIERS

/**
 * Per-tier non-feature limits. Distinct from `FEATURE_TIERS` because these
 * are caps on quantity, not on/off entitlements.
 *
 * `maxSeats` is `Infinity` everywhere until the founder sets concrete caps.
 * The infrastructure ships now; the policy is a one-constant change later.
 */
export const PLAN_LIMITS = {
  standard: { maxSeats: Number.POSITIVE_INFINITY },
  pro: { maxSeats: Number.POSITIVE_INFINITY },
  max: { maxSeats: Number.POSITIVE_INFINITY },
  enterprise: { maxSeats: Number.POSITIVE_INFINITY },
} as const satisfies Record<PlanTier, { maxSeats: number }>

export function meetsFeatureTier(actorTier: PlanTier, feature: FeatureKey): boolean {
  return TIER_RANK[actorTier] >= TIER_RANK[FEATURE_TIERS[feature]]
}

export function isPlanTier(value: unknown): value is PlanTier {
  return value === "standard" || value === "pro" || value === "max" || value === "enterprise"
}
