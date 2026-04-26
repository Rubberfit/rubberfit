"use client"

import { useMemo, useState } from "react"

import type { PartTemplate } from "./PresetDimensionSelector"
import type { StockConfig } from "./stock-preview-configurator"
import type { ManualPlacement } from "./free-roam-collision"
import type { LayoutModel, LayoutRegion, PlacedPart } from "./layout-model"
import { buildFreeRoamLayout } from "./free-roam-layout"

/**
 * Owns the layout build and the per-id PlacedPart ref cache (issue
 * #117 phase 3). The cache is a stable Map held via `useState` lazy
 * init; `buildFreeRoamLayout` reads + mutates it so `React.memo`'d
 * `PartShape` can skip reconciliation for stationary placements
 * during drag.
 *
 * Output `layout.parts` reuses refs from the previous render for any
 * placement whose visual inputs (position, rotation, label,
 * specIndex, geometry) are unchanged.
 */
export function useFreeRoamLayout(
  placements: ManualPlacement[],
  parts: PartTemplate[],
  stock: StockConfig,
  tagByTemplateId: Map<string, string>,
  offcuts: LayoutRegion[],
  scrap: LayoutRegion[]
): LayoutModel {
  const [previousPartsById] = useState<Map<string, PlacedPart>>(() => new Map())
  return useMemo(() => {
    const base = buildFreeRoamLayout(placements, parts, stock, tagByTemplateId, previousPartsById)
    return { ...base, offcuts, scrap }
  }, [placements, parts, stock, tagByTemplateId, offcuts, scrap, previousPartsById])
}
