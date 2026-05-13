import {
  FEATURE_TIERS,
  type FeatureKey,
  type PlanTier,
} from "@/src/application/billing/feature-tiers"

/**
 * Customer-facing copy for each gated feature. Kept in one place so
 * the marketing pricing page, the route-level LockScreen, and the
 * action-level UpgradeModal all reference the same strings — no
 * version skew between "what the upsell promises" and "what the
 * pricing page lists".
 *
 * Add an entry here whenever a new key is added to `FEATURE_TIERS`.
 * The architecture test in `tests/architecture/feature-tier-coverage`
 * asserts coverage so the build fails if a feature key has no copy.
 */
interface FeatureCopy {
  label: string
  category: string
  pathLabel: string
}

export const FEATURE_COPY: Record<FeatureKey, FeatureCopy> = {
  // Standard — operational floor (these typically don't appear in
  // the lock UI because Standard is the minimum paying tier, but we
  // ship copy for them anyway in case a tier downgrade traps a user
  // on a Standard route they previously had access to.)
  auto_nest: { label: "Auto Nest", category: "Nesting", pathLabel: "/NESTING" },
  free_roam: { label: "Free-roam editor", category: "Nesting", pathLabel: "/NESTING" },
  roll_lineage: { label: "Roll lineage", category: "Inventory", pathLabel: "/INVENTORY" },
  first_class_offcuts: {
    label: "First-class offcuts",
    category: "Inventory",
    pathLabel: "/INVENTORY",
  },
  job_lifecycle: { label: "Job lifecycle", category: "Jobs", pathLabel: "/JOBS" },
  job_customer_pdfs: {
    label: "Customer-facing job PDFs",
    category: "Jobs",
    pathLabel: "/JOBS",
  },
  barcode_receiving: {
    label: "Barcode receiving",
    category: "Inventory",
    pathLabel: "/INVENTORY",
  },
  barcode_scanning: {
    label: "Barcode scanning",
    category: "Inventory",
    pathLabel: "/INVENTORY",
  },
  in_app_notifications: {
    label: "In-app notifications",
    category: "Workspace",
    pathLabel: "/NOTIFICATIONS",
  },
  rbac_six_role: { label: "Six-role RBAC", category: "Workspace", pathLabel: "/USERS" },

  // Pro — manager visibility upgrades
  analytics_waste: { label: "Waste analytics", category: "Analytics", pathLabel: "/ANALYTICS" },
  analytics_costs: { label: "Cost analytics", category: "Analytics", pathLabel: "/ANALYTICS" },
  analytics_trends: { label: "Trend analytics", category: "Analytics", pathLabel: "/ANALYTICS" },
  analytics_usage: { label: "Usage analytics", category: "Analytics", pathLabel: "/ANALYTICS" },
  analytics_reports: {
    label: "Analytics reports",
    category: "Analytics",
    pathLabel: "/ANALYTICS",
  },
  cut_history_exports: {
    label: "Cut-history exports (CSV)",
    category: "Exports",
    pathLabel: "/EXPORTS",
  },
  supplier_price_history: {
    label: "Supplier price history",
    category: "Procurement",
    pathLabel: "/PROCUREMENT",
  },
  branded_pdfs: { label: "Branded customer PDFs", category: "Jobs", pathLabel: "/JOBS" },
  custom_barcode_formats: {
    label: "Custom barcode formats",
    category: "Inventory",
    pathLabel: "/INVENTORY",
  },

  // Max — full business stack
  full_crm: { label: "Full CRM", category: "CRM", pathLabel: "/CRM" },
  ai_planner: { label: "AI-augmented planner", category: "Planner", pathLabel: "/PLANNER" },
  advanced_nesting: {
    label: "Advanced nesting heuristics",
    category: "Nesting",
    pathLabel: "/NESTING",
  },
  multi_shop: { label: "Multi-shop coordination", category: "CRM", pathLabel: "/CRM" },
  cross_team_scheduling: {
    label: "Cross-team operator scheduling",
    category: "CRM",
    pathLabel: "/CRM",
  },
}

interface TierMeta {
  label: string
  price: string
  blurb: string
}

export const TIER_META: Record<PlanTier, TierMeta> = {
  standard: {
    label: "Standard",
    price: "$199/mo",
    blurb: "Auto-nest, jobs, lineage, customer PDFs, barcode, RBAC.",
  },
  pro: {
    label: "Pro",
    price: "$349/mo",
    blurb: "Standard + full analytics, exports, branded PDFs, supplier price history.",
  },
  max: {
    label: "Max",
    price: "$699/mo",
    blurb: "Pro + CRM, AI planner, advanced nesting, multi-shop coordination.",
  },
  enterprise: {
    label: "Enterprise",
    price: "Custom",
    blurb: "Manually provisioned. Custom deployment, SLA, dedicated support.",
  },
}

/**
 * Build the "what you're missing" list shown on the LockScreen: every
 * feature at exactly the required tier that the current tier doesn't
 * have. Capped at five items to fit Kimi's spec; the overflow count
 * appears as a "+ N more" mono link.
 */
export function getMissingFeatures(
  currentTier: PlanTier,
  requiredTier: PlanTier
): { items: string[]; overflow: number } {
  const candidates: string[] = []
  for (const [key, tier] of Object.entries(FEATURE_TIERS)) {
    if (tier === requiredTier) {
      candidates.push(FEATURE_COPY[key as FeatureKey].label)
    }
  }
  if (candidates.length <= 5) {
    return { items: candidates, overflow: 0 }
  }
  return { items: candidates.slice(0, 5), overflow: candidates.length - 5 }
}
