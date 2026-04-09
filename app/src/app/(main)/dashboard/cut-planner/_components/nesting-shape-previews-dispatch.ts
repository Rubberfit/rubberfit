// Preview dispatch functions — multi-part layout and single-part routing
// Split from nesting-shape-previews-advanced.ts to keep files under 500 lines

import type {
  OffcutBand,
  SimplePartPreview,
  SimplePartSpec,
  NestingVisualizerProps,
  MultiSheetResult,
  SheetPreview,
} from "./nesting-visualizer-types"
import {
  bandFitsAnyPreviewItem,
  computeIntraBlankWaste,
  getPlacementBounds,
  buildShelfGapBands,
  formatInches,
} from "./nesting-layout-utils"
import {
  packPreviewItemsOnShelves,
  packRectItemsWithGuillotine,
  packIntoFreeRects,
} from "./nesting-packing-utils"
import { buildPartPreviewItem, getPartTypeLabel } from "./nesting-preview-builders"
import { generateRectanglePreview, generateCirclePreview } from "./nesting-shape-previews-basic"
import { computeFabricationScore } from "./nesting-preview-builders"
import {
  generateCylinderPreview,
  generateConePreview,
  generateTrapezoidPreview,
} from "./nesting-shape-previews-advanced"
import type { PreviewItem } from "./nesting-visualizer-types"

export { globalMultiSheetPack } from "./nesting-global-packer"

interface PackingCandidate {
  sortBy: string
  packed: { items: PreviewItem[]; usedArea: number; freeRects?: OffcutBand[] }
  bounds: ReturnType<typeof getPlacementBounds>
  offcutBands: OffcutBand[]
  scrapBands: OffcutBand[]
  reusableArea: number
  scrapArea: number
  trimDensity: number
}

function evaluatePackingCandidate(
  requestedItems: (PreviewItem & { usedArea: number })[],
  rollW: number,
  rollL: number,
  sortBy: "area" | "height" | "width" | "max-edge",
  allRectangles: boolean
): PackingCandidate {
  const packed = allRectangles
    ? packRectItemsWithGuillotine(requestedItems, rollW, rollL, sortBy)
    : packPreviewItemsOnShelves(requestedItems, rollW, rollL, sortBy)
  const bounds = getPlacementBounds(packed.items)
  const allBands = allRectangles
    ? (packed.freeRects ?? [])
    : buildShelfGapBands(packed.items, rollW, rollL)
  const offcutBands: OffcutBand[] = []
  const scrapBands: OffcutBand[] = []
  let reusableArea = 0
  let scrapArea = 0

  allBands.forEach((band) => {
    const area = band.width * band.height
    if (bandFitsAnyPreviewItem(band, packed.items)) {
      offcutBands.push(band)
      reusableArea += area
    } else {
      scrapBands.push(band)
      scrapArea += area
    }
  })

  const intraBlankWaste = packed.items.reduce((sum, item) => sum + computeIntraBlankWaste(item), 0)
  scrapArea += intraBlankWaste
  const trimDensity =
    bounds.occupiedWidth * bounds.occupiedHeight > 0
      ? scrapArea / (bounds.occupiedWidth * bounds.occupiedHeight)
      : 1

  return { sortBy, packed, bounds, offcutBands, scrapBands, reusableArea, scrapArea, trimDensity }
}

function comparePackingCandidates(a: PackingCandidate, b: PackingCandidate): number {
  if (a.packed.items.length !== b.packed.items.length)
    return b.packed.items.length - a.packed.items.length
  if (Math.abs(a.scrapArea - b.scrapArea) > 0.001) return a.scrapArea - b.scrapArea
  if (Math.abs(a.trimDensity - b.trimDensity) > 0.0001) return a.trimDensity - b.trimDensity
  if (Math.abs(a.reusableArea - b.reusableArea) > 0.001) return b.reusableArea - a.reusableArea
  if (Math.abs(a.bounds.occupiedHeight - b.bounds.occupiedHeight) > 0.001)
    return a.bounds.occupiedHeight - b.bounds.occupiedHeight
  return 0
}

// eslint-disable-next-line complexity -- multi-part packing with many derived metrics
export function generateMultiPartPreview(
  rollW: number,
  rollL: number,
  simpleParts: SimplePartSpec[],
  fallbackWidth: number,
  fallbackHeight: number
): SimplePartPreview {
  const requestedItems = simpleParts.flatMap((spec) =>
    Array.from({ length: Math.max(1, spec.quantity || 1) }, () =>
      buildPartPreviewItem(spec, fallbackWidth, fallbackHeight)
    )
  )
  const allRectangles = requestedItems.every((item) => item.renderShape === "rect")
  const candidates = (["area", "height", "width", "max-edge"] as const).map((sortBy) =>
    evaluatePackingCandidate(requestedItems, rollW, rollL, sortBy, allRectangles)
  )

  candidates.sort(comparePackingCandidates)

  const best = candidates[0]
  const placedItems = best?.packed.items ?? []
  const usedArea = best?.packed.usedArea ?? 0
  const bounds = best?.bounds ?? getPlacementBounds([])
  const offcutBands = best?.offcutBands ?? []
  const scrapBands = best?.scrapBands ?? []
  const reusableArea = best?.reusableArea ?? 0
  const scrapArea = best?.scrapArea ?? 0
  const wasteArea = reusableArea + scrapArea
  const partType = simpleParts[0]?.partType ?? "rectangle"
  const partLabel = getPartTypeLabel(partType)

  return {
    renderShape: placedItems[0]?.renderShape ?? "rect",
    strategyName: `${partLabel} mixed-size layout`,
    strategyNote: best
      ? `Selected standard sizes are packed together on the chosen stock using a ${allRectangles ? "guillotine-fit" : `${best.sortBy}-first shelf`} layout scored for lower trim scrap.`
      : "Selected standard sizes are packed together on the chosen stock preview.",
    placementMode: "origin",
    wasteMode: "bands",
    cutPlanTitle: `${partLabel} cut sequence`,
    cutSteps: [
      {
        title: "Rough-cut the selected blanks in placement order",
        detail:
          "The preview stacks every selected size on the same stock so the operator can work from one layout.",
      },
      {
        title: "Finish each profile from its placed blank",
        detail:
          "Non-rectangular parts show their blank scrap directly so the cutter can see where the finished profile comes out of each placement.",
      },
    ],
    requestedUnits: requestedItems.length,
    unitsCompleted: placedItems.length,
    overflowUnits: Math.max(0, requestedItems.length - placedItems.length),
    piecesShown: placedItems.length,
    piecesPerUnit: 1,
    usedArea,
    wasteArea,
    wastePct: rollW * rollL > 0 ? (wasteArea / (rollW * rollL)) * 100 : 100,
    reusableArea,
    scrapArea,
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
    items: placedItems,
    offcutBands,
    scrapBands,
    placements: placedItems,
    label: placedItems[0]?.label ?? "",
  } as SimplePartPreview
}

export function generateSimplePartPreview(
  rollW: number,
  rollL: number,
  simplePart: NonNullable<NestingVisualizerProps["simplePart"]>,
  fallbackWidth: number,
  fallbackHeight: number,
  fallbackQty: number
): SimplePartPreview {
  const qty = Math.max(1, simplePart.quantity || fallbackQty)

  switch (simplePart.partType) {
    case "circle":
      return generateCirclePreview(rollW, rollL, simplePart.diameter ?? fallbackWidth, qty)
    case "cylinder":
      return generateCylinderPreview(
        rollW,
        rollL,
        simplePart.diameter ?? fallbackWidth,
        simplePart.height ?? fallbackHeight,
        qty,
        simplePart.cutDirection,
        simplePart.cutRatios
      )
    case "cone":
      return generateConePreview(
        rollW,
        rollL,
        simplePart.innerRadius ?? Math.max(1, fallbackWidth / 2),
        simplePart.outerRadius ?? Math.max(2, fallbackHeight),
        simplePart.arcDegrees ?? 120,
        qty,
        simplePart.cutDirection,
        simplePart.cutRatios
      )
    case "trapezoid":
      return generateTrapezoidPreview(
        rollW,
        rollL,
        simplePart.topWidth ?? fallbackWidth,
        simplePart.bottomWidth ?? fallbackWidth,
        simplePart.height ?? fallbackHeight,
        qty,
        simplePart.cutDirection,
        simplePart.cutRatios
      )
    case "rectangle":
    default:
      return generateRectanglePreview(
        rollW,
        rollL,
        simplePart.width ?? fallbackWidth,
        simplePart.length ?? fallbackHeight,
        qty
      )
  }
}

export function computeMultiSheetPreviews(
  preview: SimplePartPreview,
  rollW: number,
  rollL: number,
  maxSheets: number = 4,
  regenerate?: (qty: number, remainingSpecs?: SimplePartSpec[]) => SimplePartPreview,
  allSpecs?: SimplePartSpec[]
): MultiSheetResult {
  const capacityPerSheet = preview.unitsCompleted
  const totalNeeded = preview.unitsCompleted + preview.overflowUnits
  const stockArea = rollW * rollL

  if (preview.overflowUnits <= 0 || capacityPerSheet <= 0) {
    const fab = computeFabricationScore(preview, rollW, rollL)
    return {
      sheets: [{ sheetIndex: 0, preview, isPartial: false }],
      totalUnitsCompleted: preview.unitsCompleted,
      totalUsedArea: preview.usedArea,
      totalReusableArea: preview.reusableArea,
      totalScrapArea: preview.scrapArea,
      totalStockArea: stockArea,
      remainingOverflow: capacityPerSheet <= 0 ? totalNeeded : 0,
      avgFabScore: fab.score,
    }
  }

  // For multi-part layouts, track remaining items by building overflow specs
  const isMultiPart = allSpecs && allSpecs.length > 1

  const sheets: SheetPreview[] = []
  let placed = 0
  let overflowSpecs = allSpecs ? [...allSpecs] : undefined

  while (placed < totalNeeded && sheets.length < maxSheets) {
    const remaining = totalNeeded - placed
    const unitsOnSheet = Math.min(capacityPerSheet, remaining)

    let sheetPreview: SimplePartPreview
    if (sheets.length === 0) {
      sheetPreview = preview
    } else if (regenerate) {
      sheetPreview = regenerate(unitsOnSheet, overflowSpecs)
    } else {
      sheetPreview = preview
    }

    // Second pass: try to fill this sheet's free rects with remaining overflow items
    if (isMultiPart && overflowSpecs && overflowSpecs.length > 0) {
      // Reduce overflow specs by what was placed on this sheet
      const placedLabels = new Map<string, number>()
      sheetPreview.items.forEach((item) => {
        placedLabels.set(item.label, (placedLabels.get(item.label) ?? 0) + 1)
      })
      let remainingSpecs = overflowSpecs
        .map((spec) => {
          const label = `${formatInches(spec.width ?? 0)}" \u00D7 ${formatInches(spec.length ?? 0)}"`
          const placedCount = placedLabels.get(label) ?? 0
          if (placedCount <= 0) return spec
          const left = Math.max(0, (spec.quantity || 1) - placedCount)
          placedLabels.set(label, placedCount - Math.min(placedCount, spec.quantity || 1))
          return left > 0 ? { ...spec, quantity: left } : null
        })
        .filter((s): s is SimplePartSpec => s !== null)

      // Build items from remaining specs and try to fit into this sheet's free space
      const allFreeRects = [
        ...(sheetPreview.offcutBands ?? []),
        ...(sheetPreview.scrapBands ?? []),
      ].filter((r) => r.width > 1 && r.height > 1)
      if (remainingSpecs.length > 0 && allFreeRects.length > 0) {
        const overflowItems = remainingSpecs.flatMap((spec) =>
          Array.from({ length: Math.max(1, spec.quantity || 1) }, () =>
            buildPartPreviewItem(spec, rollW, rollL)
          )
        )
        const gapFill = packIntoFreeRects(overflowItems, allFreeRects)
        if (gapFill.placed.length > 0) {
          // Merge gap-filled items into this sheet's preview
          const mergedItems = [...sheetPreview.items, ...gapFill.placed]
          const mergedUsedArea = sheetPreview.usedArea + gapFill.usedArea
          const bounds = getPlacementBounds(mergedItems)
          // Reclassify remaining free rects
          const newOffcutBands: OffcutBand[] = []
          const newScrapBands: OffcutBand[] = []
          let newReusableArea = 0
          let newScrapArea = 0
          gapFill.remainingFreeRects.forEach((band) => {
            const area = band.width * band.height
            if (bandFitsAnyPreviewItem(band, mergedItems)) {
              newOffcutBands.push(band)
              newReusableArea += area
            } else {
              newScrapBands.push(band)
              newScrapArea += area
            }
          })
          const intraWaste = mergedItems.reduce(
            (sum, item) => sum + computeIntraBlankWaste(item),
            0
          )
          newScrapArea += intraWaste

          sheetPreview = {
            ...sheetPreview,
            items: mergedItems,
            placements: mergedItems,
            unitsCompleted: mergedItems.length,
            usedArea: mergedUsedArea,
            offcutBands: newOffcutBands,
            scrapBands: newScrapBands,
            reusableArea: newReusableArea,
            scrapArea: newScrapArea,
            wasteArea: newReusableArea + newScrapArea,
            wastePct: stockArea > 0 ? ((newReusableArea + newScrapArea) / stockArea) * 100 : 100,
            occupiedWidth: bounds.occupiedWidth,
            occupiedHeight: bounds.occupiedHeight,
            overflowUnits: Math.max(0, sheetPreview.overflowUnits - gapFill.placed.length),
          } as SimplePartPreview

          // Reduce remaining specs by gap-filled items
          const gapLabels = new Map<string, number>()
          gapFill.placed.forEach((item) => {
            gapLabels.set(item.label, (gapLabels.get(item.label) ?? 0) + 1)
          })
          remainingSpecs = remainingSpecs
            .map((spec) => {
              const label = `${formatInches(spec.width ?? 0)}" \u00D7 ${formatInches(spec.length ?? 0)}"`
              const gapCount = gapLabels.get(label) ?? 0
              if (gapCount <= 0) return spec
              const left = Math.max(0, (spec.quantity || 1) - gapCount)
              gapLabels.set(label, gapCount - Math.min(gapCount, spec.quantity || 1))
              return left > 0 ? { ...spec, quantity: left } : null
            })
            .filter((s): s is SimplePartSpec => s !== null)
        }
      }

      overflowSpecs = remainingSpecs
    }

    const isPartial = sheetPreview.unitsCompleted < capacityPerSheet
    sheets.push({ sheetIndex: sheets.length, preview: sheetPreview, isPartial })
    placed += sheetPreview.unitsCompleted

    if (isMultiPart && overflowSpecs && overflowSpecs.length === 0) break
  }

  const totalUnitsCompleted = sheets.reduce((s, sh) => s + sh.preview.unitsCompleted, 0)
  const totalUsedArea = sheets.reduce((s, sh) => s + sh.preview.usedArea, 0)
  const totalReusableArea = sheets.reduce((s, sh) => s + sh.preview.reusableArea, 0)
  const totalScrapArea = sheets.reduce((s, sh) => s + sh.preview.scrapArea, 0)
  const remainingOverflow = Math.max(0, totalNeeded - totalUnitsCompleted)
  const fabScores = sheets.map((sh) => computeFabricationScore(sh.preview, rollW, rollL).score)
  const avgFabScore = Math.round(fabScores.reduce((a, b) => a + b, 0) / fabScores.length)

  return {
    sheets,
    totalUnitsCompleted,
    totalUsedArea,
    totalReusableArea,
    totalScrapArea,
    totalStockArea: stockArea * sheets.length,
    remainingOverflow,
    avgFabScore,
  }
}
