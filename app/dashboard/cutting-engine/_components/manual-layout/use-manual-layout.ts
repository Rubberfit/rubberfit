"use client"

import { useMemo, useState } from "react"

import type { PartTemplate } from "../PresetDimensionSelector"
import type { StockConfig } from "../stock-preview-configurator"
import type { ManualPlacement } from "./collision"
import type { LayoutModel, LayoutRegion, PlacedPart } from "../layout-model"
import { buildManualLayout } from "./manual-layout"

/** Shared key for the single-entry `layoutCache` Map. */
const LAYOUT_CACHE_KEY = "current"

/**
 * Owns the layout build and the per-id PlacedPart ref cache (issue
 * #117 phase 3). The cache is a stable Map held via `useState` lazy
 * init; `buildManualLayout` reads + mutates it so `React.memo`'d
 * `PartShape` can skip reconciliation for stationary placements
 * during drag.
 *
 * Output `layout.parts` reuses refs from the previous render for any
 * placement whose visual inputs (position, rotation, label,
 * specIndex, geometry) are unchanged.
 *
 * Issue #140 / ARC-91: the outer `LayoutModel` reference is also held
 * stable across drag ticks via a single-cell Map cache (mirrors the
 * `previousPartsById` pattern so React 19's `react-hooks/refs` lint
 * stays happy with mid-render reads). When every visible field is
 * identity-equal to the prior return (parts ref-by-ref + offcuts/scrap
 * ref + sheet dimensions + counters), we hand back the exact same
 * object instead of allocating a fresh wrapper. Combined with
 * `EMPTY_LAYOUT_REGIONS` in `regions.ts` and the
 * `React.memo` on `KonvaSheetRenderer`, the renderer's function body
 * can skip re-execution per drag tick when nothing visible changed.
 */
export function useManualLayout(
  placements: ManualPlacement[],
  parts: PartTemplate[],
  stock: StockConfig,
  tagByTemplateId: Map<string, string>,
  offcuts: readonly LayoutRegion[],
  scrap: readonly LayoutRegion[]
): LayoutModel {
  const [previousPartsById] = useState<Map<string, PlacedPart>>(() => new Map())
  // Single-cell Map used as a mutable holder for the prior
  // `LayoutModel`. We can't use `useRef` here — React 19's
  // `react-hooks/refs` lint rule forbids ref reads + writes during
  // render, and a `useState`-held cell tripped the
  // `react-hooks/immutability` rule on `.current = next`. A Map
  // accepts `.set()` mutations without lint complaint (same pattern
  // as `previousPartsById` above) and gives us an O(1) cache cell.
  const [layoutCache] = useState<Map<typeof LAYOUT_CACHE_KEY, LayoutModel>>(() => new Map())
  return useMemo(() => {
    const base = buildManualLayout(placements, parts, stock, tagByTemplateId, previousPartsById)
    const previous = layoutCache.get(LAYOUT_CACHE_KEY)

    // Bail out with the prior `LayoutModel` reference when every
    // field is identity-equal. `base.parts` already reuses element
    // refs via `previousPartsById`, so a same-length + element-by-
    // element strict-equal pass is enough for the parts array. The
    // offcuts/scrap arrays arrive as references from the regions
    // pipeline and are identity-stable across ticks when content-
    // equal (see `EMPTY_LAYOUT_REGIONS` in `regions.ts`).
    // The remaining numeric fields are derived deterministically
    // from inputs that haven't changed when `parts` matches, but
    // we compare them anyway so any future field addition fails
    // closed (allocates a new wrapper) rather than silently aliasing.
    if (
      previous != null &&
      previous.offcuts === offcuts &&
      previous.scrap === scrap &&
      previous.sheetWidth === base.sheetWidth &&
      previous.sheetLength === base.sheetLength &&
      previous.placedCount === base.placedCount &&
      previous.overflowCount === base.overflowCount &&
      previous.usedAreaSqFt === base.usedAreaSqFt &&
      previous.reusableAreaSqFt === base.reusableAreaSqFt &&
      previous.scrapAreaSqFt === base.scrapAreaSqFt &&
      previous.fabScore === base.fabScore &&
      previous.source === base.source &&
      previous.parts.length === base.parts.length &&
      previous.parts.every((p, i) => p === base.parts[i])
    ) {
      return previous
    }

    const next: LayoutModel = {
      ...base,
      offcuts: offcuts as LayoutRegion[],
      scrap: scrap as LayoutRegion[],
    }
    layoutCache.set(LAYOUT_CACHE_KEY, next)
    return next
  }, [placements, parts, stock, tagByTemplateId, offcuts, scrap, previousPartsById, layoutCache])
}
