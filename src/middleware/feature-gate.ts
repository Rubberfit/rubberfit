import type { FeatureKey } from "@/src/application/billing/feature-tiers"

/**
 * Path-segment boundary match: returns true when `pathname` equals
 * `prefix` exactly or has `prefix/` followed by more segments. Avoids
 * the classic `startsWith` foot-gun where `/foo` matches `/foobar`.
 */
function matchesPathSegment(pathname: string, prefix: string): boolean {
  if (pathname === prefix) return true
  return pathname.startsWith(`${prefix}/`)
}

/**
 * Route-level feature gates evaluated by the proxy after the
 * subscription gate. Returns the FeatureKey required to access the
 * given pathname, or `null` for paths that have no per-tier
 * restriction.
 *
 * Action-level gates (export-cut-history, custom-barcode-formats,
 * branded-PDF generation) live next to their server actions via
 * `requireFeature(actor, ...)` — those don't appear here because the
 * proxy doesn't see action invocations, only top-level route hits.
 *
 * The proxy also doesn't see `/api/v2/pack` (excluded from the
 * matcher and validates its own Supabase JWT), so the Max-tier
 * `advanced_nesting` knobs are enforced inside `api/v2/pack.rs`,
 * not here.
 *
 * When a future route needs gating, add it here AND ensure the
 * destination page has a Storybook-style rendering test in
 * tests/architecture/feature-tier-coverage.test.ts.
 */
export function getRequiredFeature(pathname: string): FeatureKey | null {
  // Analytics — all Pro. The bare `/dashboard/analytics` index page
  // uses analytics_waste as its representative gate so a Standard
  // user navigating the dashboard nav lands on the lock screen with
  // a coherent "Analytics requires Pro" message. Subpages get more
  // specific feature keys so the lock-screen copy can speak to the
  // analytics module the user actually attempted.
  if (matchesPathSegment(pathname, "/dashboard/analytics/waste")) return "analytics_waste"
  if (matchesPathSegment(pathname, "/dashboard/analytics/waste-comparison"))
    return "analytics_waste"
  if (matchesPathSegment(pathname, "/dashboard/analytics/costs")) return "analytics_costs"
  if (matchesPathSegment(pathname, "/dashboard/analytics/trends")) return "analytics_trends"
  if (matchesPathSegment(pathname, "/dashboard/analytics/usage")) return "analytics_usage"
  if (matchesPathSegment(pathname, "/dashboard/analytics/reports")) return "analytics_reports"
  if (matchesPathSegment(pathname, "/dashboard/analytics")) return "analytics_waste"

  // The cut-history analytics API serves every analytics dashboard.
  // Gating it on analytics_waste is consistent with the dashboard
  // index gate and avoids a Pro-but-feature-specific carve-out.
  if (matchesPathSegment(pathname, "/api/analytics")) return "analytics_waste"

  // Supplier price-history reports — Pro.
  if (matchesPathSegment(pathname, "/dashboard/inventory/materials/pricing")) {
    return "supplier_price_history"
  }

  return null
}
