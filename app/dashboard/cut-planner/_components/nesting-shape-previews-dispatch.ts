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

export { globalMultiSheetPack } from "./nesting-global-packer-entry"

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

const MIN_TRAPEZOID_STEP = 2

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

function packInterleavedTrapezoids(
  items: (PreviewItem & { usedArea: number })[],
  rollW: number,
  rollL: number
): PackingCandidate | null {
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(b.height - a.height) > 0.001) return b.height - a.height
    return b.width - a.width
  })

  const placedItems: PreviewItem[] = []
  let totalUsedArea = 0
  let currentY = 0
  let currentX = 0
  let rowHeight = 0
  let placedInRow = 0

  const skipped: typeof sorted = []

  for (let idx = 0; idx < sorted.length; idx++) {
    const item = sorted[idx]
    const topW = item.topWidth ?? item.width
    const botW = item.bottomWidth ?? item.width
    const boxW = Math.max(topW, botW)

    if (currentX + boxW > rollW + 0.001) {
      currentY += rowHeight
      currentX = 0
      rowHeight = 0
      placedInRow = 0
    }
    if (currentY + item.height > rollL + 0.001) {
      skipped.push(item)
      continue
    }

    placedItems.push({
      ...item,
      x: currentX,
      y: currentY,
      flipped: placedInRow % 2 === 1,
    })
    totalUsedArea += item.usedArea
    rowHeight = Math.max(rowHeight, item.height)
    placedInRow++

    const next = sorted[idx + 1]
    let step = (topW + botW) / 2
    if (next) {
      const nTopW = next.topWidth ?? next.width
      const nBotW = next.bottomWidth ?? next.width
      const nBoxW = Math.max(nTopW, nBotW)
      step = Math.max((boxW + botW - nBoxW + nTopW) / 2, (boxW + topW - nBoxW + nBotW) / 2)
    }
    currentX += Math.max(step, MIN_TRAPEZOID_STEP)
  }

  // Retry skipped items — they may fit after row advancement
  for (const item of skipped) {
    const topW = item.topWidth ?? item.width
    const botW = item.bottomWidth ?? item.width
    const boxW = Math.max(topW, botW)

    if (currentX + boxW > rollW + 0.001) {
      currentY += rowHeight
      currentX = 0
      rowHeight = 0
      placedInRow = 0
    }
    if (currentY + item.height > rollL + 0.001) continue

    placedItems.push({
      ...item,
      x: currentX,
      y: currentY,
      flipped: placedInRow % 2 === 1,
    })
    totalUsedArea += item.usedArea
    rowHeight = Math.max(rowHeight, item.height)
    placedInRow++

    currentX += Math.max((topW + botW) / 2, MIN_TRAPEZOID_STEP)
  }

  if (placedItems.length === 0) return null

  const bounds = getPlacementBounds(placedItems)
  const allBands = buildShelfGapBands(placedItems, rollW, rollL)
  const offcutBands: OffcutBand[] = []
  const scrapBands: OffcutBand[] = []
  let reusableArea = 0
  let scrapArea = 0

  allBands.forEach((band) => {
    const area = band.width * band.height
    if (bandFitsAnyPreviewItem(band, placedItems)) {
      offcutBands.push(band)
      reusableArea += area
    } else {
      scrapBands.push(band)
      scrapArea += area
    }
  })

  const intraBlankWaste = placedItems.reduce((sum, item) => sum + computeIntraBlankWaste(item), 0)
  scrapArea += intraBlankWaste
  const trimDensity =
    bounds.occupiedWidth * bounds.occupiedHeight > 0
      ? scrapArea / (bounds.occupiedWidth * bounds.occupiedHeight)
      : 1

  return {
    sortBy: "interleaved",
    packed: { items: placedItems, usedArea: totalUsedArea },
    bounds,
    offcutBands,
    scrapBands,
    reusableArea,
    scrapArea,
    trimDensity,
  }
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
  const allTrapezoids = requestedItems.every((item) => item.renderShape === "trapezoid")

  let best: PackingCandidate | undefined

  if (allTrapezoids && requestedItems.length >= 2) {
    best = packInterleavedTrapezoids(requestedItems, rollW, rollL) ?? undefined
  }

  if (!best) {
    const candidates = (["area", "height", "width", "max-edge"] as const).map((sortBy) =>
      evaluatePackingCandidate(requestedItems, rollW, rollL, sortBy, allRectangles)
    )
    candidates.sort(comparePackingCandidates)
    best = candidates[0]
  }
  const placedItems = best?.packed.items ?? []
  const usedArea = best?.packed.usedArea ?? 0
  const bounds = best?.bounds ?? getPlacementBounds([])
  const offcutBands = best?.offcutBands ?? []
  const scrapBands = best?.scrapBands ?? []

  // Raw band areas may overlap (maximal rectangles share area) and
  // interlocked trapezoid bounding boxes double-count intra-blank waste.
  // Proportionally correct so totals equal actual free area.
  const stockArea = rollW * rollL
  const actualFreeArea = Math.max(0, stockArea - usedArea)
  const rawReusable = best?.reusableArea ?? 0
  const rawScrap = best?.scrapArea ?? 0
  const rawTotal = rawReusable + rawScrap
  let reusableArea: number
  let scrapArea: number
  if (rawTotal > 0) {
    reusableArea = actualFreeArea * (rawReusable / rawTotal)
    scrapArea = actualFreeArea - reusableArea
  } else {
    reusableArea = 0
    scrapArea = actualFreeArea
  }
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

// Matches placed items back to specs by formatted dimension label. This couples
// to the label format in buildPartPreviewItem — keep them in sync.
function reduceSpecsByPlacedItems(
  specs: SimplePartSpec[],
  items: PreviewItem[]
): SimplePartSpec[] {
  const labels = new Map<string, number>()
  items.forEach((item) => {
    labels.set(item.label, (labels.get(item.label) ?? 0) + 1)
  })
  return specs
    .map((spec) => {
      // Use buildPartPreviewItem to derive the label so all part types
      // (trapezoid, cone, cylinder, etc.) match the placed-item format.
      const label = buildPartPreviewItem(spec, 0, 0).label
      const count = labels.get(label) ?? 0
      if (count <= 0) return spec
      const left = Math.max(0, (spec.quantity || 1) - count)
      labels.set(label, count - Math.min(count, spec.quantity || 1))
      return left > 0 ? { ...spec, quantity: left } : null
    })
    .filter((s): s is SimplePartSpec => s !== null)
}

function tryGapFillSheet(
  sheetPreview: SimplePartPreview,
  remainingSpecs: SimplePartSpec[],
  rollW: number,
  rollL: number,
  stockArea: number
): { preview: SimplePartPreview; remainingSpecs: SimplePartSpec[] } {
  const allFreeRects = [
    ...(sheetPreview.offcutBands ?? []),
    ...(sheetPreview.scrapBands ?? []),
  // 1" minimum is intentional: gap-fill only considers rects large enough to fit
  // another part, unlike MIN_GAP_BAND_SIZE (0.25") which controls band rendering.
  ].filter((r) => r.width > 1 && r.height > 1)

  if (remainingSpecs.length === 0 || allFreeRects.length === 0) {
    return { preview: sheetPreview, remainingSpecs }
  }

  const overflowItems = remainingSpecs.flatMap((spec) =>
    Array.from({ length: Math.max(1, spec.quantity || 1) }, () =>
      buildPartPreviewItem(spec, rollW, rollL)
    )
  )
  const gapFill = packIntoFreeRects(overflowItems, allFreeRects)
  if (gapFill.placed.length === 0) {
    return { preview: sheetPreview, remainingSpecs }
  }

  const mergedItems = [...sheetPreview.items, ...gapFill.placed]
  const mergedUsedArea = sheetPreview.usedArea + gapFill.usedArea
  const bounds = getPlacementBounds(mergedItems)
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
  newScrapArea += mergedItems.reduce((sum, item) => sum + computeIntraBlankWaste(item), 0)

  // Proportionally correct waste areas to equal actual free area
  // (raw band areas from MaxRects may overlap as maximal rectangles share space)
  const actualFreeArea = Math.max(0, stockArea - mergedUsedArea)
  const rawWasteTotal = newReusableArea + newScrapArea
  let correctedReusable: number
  let correctedScrap: number
  if (rawWasteTotal > 0) {
    correctedReusable = actualFreeArea * (newReusableArea / rawWasteTotal)
    correctedScrap = actualFreeArea - correctedReusable
  } else {
    correctedReusable = 0
    correctedScrap = actualFreeArea
  }

  const updatedPreview = {
    ...sheetPreview,
    items: mergedItems,
    placements: mergedItems,
    unitsCompleted: mergedItems.length,
    piecesShown: mergedItems.length,
    requestedUnits: sheetPreview.requestedUnits,
    usedArea: mergedUsedArea,
    offcutBands: newOffcutBands,
    scrapBands: newScrapBands,
    reusableArea: correctedReusable,
    scrapArea: correctedScrap,
    wasteArea: correctedReusable + correctedScrap,
    wastePct: stockArea > 0 ? ((correctedReusable + correctedScrap) / stockArea) * 100 : 100,
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
    overflowUnits: Math.max(0, sheetPreview.overflowUnits - gapFill.placed.length),
  } as SimplePartPreview

  return {
    preview: updatedPreview,
    remainingSpecs: reduceSpecsByPlacedItems(remainingSpecs, gapFill.placed),
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

    if (isMultiPart && overflowSpecs && overflowSpecs.length > 0) {
      let remainingSpecs = reduceSpecsByPlacedItems(overflowSpecs, sheetPreview.items)
      const gapResult = tryGapFillSheet(sheetPreview, remainingSpecs, rollW, rollL, stockArea)
      sheetPreview = gapResult.preview
      remainingSpecs = gapResult.remainingSpecs
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
