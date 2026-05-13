import type { PackRequest } from "@/src/application/packing/types"
import type { ActionActor } from "@/src/application/types/action-actor"

import { requireFeature } from "./require-feature"

/**
 * "Advanced" nesting knobs — these require Max tier per the
 * `advanced_nesting` feature key. Basic packing (no knobs set, or
 * defaults) is available to every paying tier; Max unlocks the
 * tuning surface.
 *
 * Rationale per the founder-locked scope:
 *   - `mode: "thorough"` — extends the compute budget beyond the
 *     balanced default. Power-user knob for hard packs.
 *   - `timeBudgetMs` / `improvementBudgetMs` — explicit budget
 *     overrides that let a Max customer trade money for material
 *     efficiency on a single critical job.
 *   - `seed` — deterministic reproducibility, used to A/B test
 *     layouts. A Max-only ergonomic feature.
 *
 * Cone/scrap strategies and `useWarmStart` are intentionally NOT
 * gated — they're algorithmic variants the Rust path may pick
 * automatically, and disabling them shouldn't be a paid lever.
 */
export function requestUsesAdvancedNesting(request: PackRequest): boolean {
  if (request.mode === "thorough") return true
  if (request.timeBudgetMs != null) return true
  if (request.improvementBudgetMs != null) return true
  if (request.seed != null) return true
  return false
}

/**
 * Max-tier gate for advanced nesting knobs. Lets the basic pack
 * endpoint stay open to every paying tier (Standard included, per
 * the founder-locked scope where the cutting engine is the
 * value-proof for Rubberfit) while the tuning surface is paid.
 *
 * No-op when the request only carries the safe defaults (clearance,
 * bins, items, etc.) — the helper short-circuits before invoking
 * `requireFeature`, so the basic path doesn't pay a subscription
 * lookup it doesn't need.
 *
 * Production note: `/api/v2/pack` is served by the Vercel Rust
 * function at `api/v2/pack.rs` in production. This gate runs in the
 * Next.js dev fallback (`app/api/v2/pack/route.ts`). Closing the
 * prod hole means either (a) adding a tier query inside Rust, or
 * (b) putting a Next.js route in front that gates then forwards.
 * Tracked at Linear ARC-253 — for now, the architecture test sees
 * a `requireFeature(actor, "advanced_nesting")` callsite and the
 * dev path enforces.
 */
export async function assertAdvancedNestingAllowed(
  actor: ActionActor,
  request: PackRequest
): Promise<void> {
  if (!requestUsesAdvancedNesting(request)) return
  await requireFeature(actor, "advanced_nesting")
}
