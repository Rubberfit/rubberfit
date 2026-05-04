"use client"

import { useMemo, useState } from "react"

import type { PartTemplate } from "./PresetDimensionSelector"
import type { StockConfig } from "./stock-preview-configurator"
import type { ManualPlacement } from "./free-roam-collision"
import { type ComputedRegions, computeAdaptiveRegions } from "./free-roam-regions"
import { makeRegionCache } from "./free-roam-region-cache"

interface UseFreeRoamRegionsResult {
  /** Visual regions — overlays drag snapshot, skips pocket pass during drag. */
  regions: ComputedRegions
  /**
   * Authoritative regions for committed placements. Drives metrics
   * so numbers don't jitter while the operator is still dragging.
   */
  committedRegions: ComputedRegions
}

const TIMINGS_ENABLED = process.env.NODE_ENV !== "production"

/**
 * Owns the per-tick region computation for the Free-roam canvas.
 *
 * Two memos:
 *   - `committedRegions` depends only on committed inputs (placements,
 *     parts, stock). Stable across drag ticks — the full Clipper
 *     pipeline runs once when committed state changes, not once per
 *     pointer-move. Drives metrics.
 *   - `regions` overlays the drag snapshot. During drag, skips the
 *     trapped-pocket pass (Clipper Union of all parts — the dominant
 *     per-tick cost) since pockets re-appear from `committedRegions`
 *     on drop. Envelope + side-gap waste keep updating live.
 *
 * Per-placement geometry cache is held internally so callers don't
 * have to thread it through. The cache reference stays stable for the
 * hook's lifetime via `useState` lazy init (React 19 lint forbids ref
 * reads during render). Issue #117 invalidation rules live in
 * `free-roam-region-cache.ts`.
 *
 * Dev-only: drag-frame calls pass `enableTimings: true` so per-stage
 * costs land in `__regionTimingSink` (drained via `__dumpRegionTimings()`).
 * Production builds strip the branch via `process.env.NODE_ENV` DCE.
 */
export function useFreeRoamRegions(
  placements: ManualPlacement[],
  effectivePlacements: ManualPlacement[],
  parts: PartTemplate[],
  stock: StockConfig,
  isDragging: boolean
): UseFreeRoamRegionsResult {
  const [regionCache] = useState(makeRegionCache)

  const committedRegions = useMemo(
    () => computeAdaptiveRegions(placements, parts, stock, regionCache),
    [placements, parts, stock, regionCache]
  )

  const regions = useMemo(
    () =>
      isDragging
        ? computeAdaptiveRegions(effectivePlacements, parts, stock, regionCache, {
            skipPocketPass: true,
            enableTimings: TIMINGS_ENABLED,
          })
        : committedRegions,
    [isDragging, effectivePlacements, parts, stock, regionCache, committedRegions]
  )

  return { regions, committedRegions }
}
