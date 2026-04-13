// Stock layout preview builders for optimized and custom packed layouts
// Split from nesting-preview-builders.ts to stay under the max-lines limit

import type {
  OffcutBand,
  PreviewItem,
  RectLikePreview,
  SimplePartPreview,
  SimpleCutDirection,
  PackedPreviewItemsResult,
} from "./nesting-visualizer-types"
import type { NestingResult } from "@/nesting/types"
import {
  buildOffcutBands,
  bandFitsAnyPreviewItem,
  computeIntraBlankWaste,
  getPlacementBounds,
  packPreviewItemsOnShelves,
} from "./nesting-layout-utils"

export function buildOptimizedStockPreview(
  preview: SimplePartPreview,
  result: NestingResult,
  items: PreviewItem[],
  rollW: number,
  rollL: number
): SimplePartPreview {
  const rollArea = result.stockArea > 0 ? result.stockArea : rollW * rollL
  const usedArea = Math.max(0, result.usedArea)
  const fallbackBounds = getPlacementBounds(items)
  const occupiedWidth =
    result.occupiedWidth > 0 ? result.occupiedWidth : fallbackBounds.occupiedWidth
  const occupiedHeight =
    result.occupiedHeight > 0 ? result.occupiedHeight : fallbackBounds.occupiedHeight
  const occupiedArea =
    result.occupiedArea > 0 ? result.occupiedArea : occupiedWidth * occupiedHeight
  const allBands = buildOffcutBands(fallbackBounds, rollW, rollL, preview.placementMode)
  const offcutBands: OffcutBand[] = []
  const scrapBands: OffcutBand[] = []
  let reusableArea = 0
  let bandScrapArea = 0

  allBands.forEach((band) => {
    const area = band.width * band.height
    if (bandFitsAnyPreviewItem(band, items)) {
      offcutBands.push(band)
      reusableArea += area
    } else {
      scrapBands.push(band)
      bandScrapArea += area
    }
  })

  const scrapArea = Math.max(0, occupiedArea - usedArea) + bandScrapArea
  const wasteArea = reusableArea + scrapArea
  const unitsCompleted =
    preview.piecesPerUnit > 0 ? Math.floor(result.placed / preview.piecesPerUnit) : result.placed
  const overflowUnits = Math.max(0, preview.requestedUnits - unitsCompleted)

  return {
    ...preview,
    items,
    usedArea,
    wasteArea,
    wastePct: rollArea > 0 ? (wasteArea / rollArea) * 100 : 100,
    reusableArea,
    scrapArea,
    occupiedWidth,
    occupiedHeight,
    unitsCompleted,
    overflowUnits,
    piecesShown: items.length,
    offcutBands,
    scrapBands,
    wasteMode: "bands",
  } as SimplePartPreview
}

export function buildCustomPackedPreview(
  rollW: number,
  rollL: number,
  items: Array<PreviewItem & { usedArea: number }>,
  config: {
    renderShape: "rect" | "trapezoid" | "sector"
    strategyName: string
    strategyNote: string
    cutDirection?: SimpleCutDirection
    requestedUnits: number
    piecesPerUnit: number
    label: string
    topWidth?: number
    bottomWidth?: number
    height?: number
    innerRadius?: number
    outerRadius?: number
    arcDegrees?: number
    cutRatios?: number[]
    cutBreakpoints?: number[]
    cutLabels?: string[]
    flipPattern?: "none" | "checker"
  }
): RectLikePreview {
  const packed = packPreviewItemsOnShelves(items, rollW, rollL, "area", config.flipPattern)
  return buildCustomPackedPreviewFromPackedResult(rollW, rollL, packed, config)
}

export function buildCustomPackedPreviewFromPackedResult(
  rollW: number,
  rollL: number,
  packed: PackedPreviewItemsResult,
  config: {
    renderShape: "rect" | "trapezoid" | "sector"
    strategyName: string
    strategyNote: string
    cutDirection?: SimpleCutDirection
    requestedUnits: number
    piecesPerUnit: number
    label: string
    topWidth?: number
    bottomWidth?: number
    height?: number
    innerRadius?: number
    outerRadius?: number
    arcDegrees?: number
    cutRatios?: number[]
    cutBreakpoints?: number[]
    cutLabels?: string[]
    flipPattern?: "none" | "checker"
  }
): RectLikePreview {
  const bounds = getPlacementBounds(packed.items)
  const allBands = packed.freeRects ?? buildOffcutBands(bounds, rollW, rollL, "origin")
  const reusableBands: OffcutBand[] = []
  const scrapBands: OffcutBand[] = []
  let reusableArea = 0
  let bandScrapArea = 0

  allBands.forEach((band) => {
    const area = band.width * band.height
    if (bandFitsAnyPreviewItem(band, packed.items)) {
      reusableBands.push(band)
      reusableArea += area
    } else {
      scrapBands.push(band)
      bandScrapArea += area
    }
  })

  const intraBlankWaste = packed.items.reduce((sum, item) => sum + computeIntraBlankWaste(item), 0)
  const scrapArea = bandScrapArea + intraBlankWaste
  const wasteArea = reusableArea + scrapArea
  const unitsCompleted = Math.floor(packed.items.length / Math.max(config.piecesPerUnit, 1))

  return {
    renderShape: config.renderShape,
    strategyName: config.strategyName,
    strategyNote: config.strategyNote,
    cutDirection: config.cutDirection,
    cutRatios: config.cutRatios,
    cutBreakpoints: config.cutBreakpoints,
    cutLabels: config.cutLabels,
    placementMode: "origin",
    wasteMode: "bands",
    cutPlanTitle: "Cut sequence",
    cutSteps: [],
    requestedUnits: config.requestedUnits,
    unitsCompleted,
    overflowUnits: Math.max(0, config.requestedUnits - unitsCompleted),
    piecesShown: packed.items.length,
    piecesPerUnit: config.piecesPerUnit,
    usedArea: packed.usedArea,
    wasteArea,
    wastePct: rollW * rollL > 0 ? (wasteArea / (rollW * rollL)) * 100 : 100,
    reusableArea,
    scrapArea,
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
    items: packed.items,
    offcutBands: reusableBands,
    scrapBands,
    placements: packed.items,
    label: config.label,
    topWidth: config.topWidth,
    bottomWidth: config.bottomWidth,
    height: config.height,
    innerRadius: config.innerRadius,
    outerRadius: config.outerRadius,
    arcDegrees: config.arcDegrees,
  }
}
