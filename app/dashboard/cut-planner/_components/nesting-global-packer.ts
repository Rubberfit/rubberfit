// Global multi-sheet bin packing using MaxRects with all 5 heuristics
//
// Ported and adapted from three reference implementations:
//
// 1. Jukka Jylänki — MaxRects reference implementation (C++)
//    https://github.com/juj/RectangleBinPack
//    "A Thousand Ways to Pack the Bin" (2010)
//    All 5 heuristics: BSSF, BLSF, BAF, BL, CP
//    Batch insertion strategy (Insert method)
//
// 2. rectpack — Python 2D rectangle packing library
//    https://github.com/secnot/rectpack
//    PackerGlobal strategy: fill each bin by picking best-fitting item
//    BBF (Bin Best Fit) multi-bin selection
//    Sort strategies: area, perimeter, diff, sside, lside
//
// 3. maxrects-packer — TypeScript MaxRects implementation
//    https://github.com/soimy/maxrects-packer
//    Split/prune reference, rotation handling

import type {
  OffcutBand,
  PreviewItem,
  RectLikePreview,
  SimplePartSpec,
  MultiSheetResult,
  SheetPreview,
} from "./nesting-visualizer-types"
import {
  countPieceFitsInBand,
  computeIntraBlankWaste,
  getPlacementBounds,
} from "./nesting-offcut-utils"
import { globalWidthPairPack } from "./nesting-width-pair-packer"
import { buildPartPreviewItem, computeFabricationScore } from "./nesting-preview-builders"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All 5 MaxRects heuristics from Jylänki's paper */
export type HeuristicType = "bssf" | "blsf" | "baf" | "bl" | "cp"

export interface FreeRect {
  x: number
  y: number
  w: number
  h: number
}

export interface Placement {
  binIndex: number
  x: number
  y: number
  w: number
  h: number
  rotated: boolean
  itemIndex: number
}

export interface PackableItem {
  index: number
  w: number
  h: number
  item: PreviewItem & { usedArea: number }
}

interface ScoreResult {
  x: number
  y: number
  w: number
  h: number
  score1: number
  score2: number
  rotated: boolean
}

// ---------------------------------------------------------------------------
// MaxRect Bin — ported from Jylänki's MaxRectsBinPack (C++)
// ---------------------------------------------------------------------------

export class MaxRectBin {
  readonly id: number
  readonly binWidth: number
  readonly binHeight: number
  freeRects: FreeRect[]
  usedRects: FreeRect[]

  constructor(id: number, width: number, height: number) {
    this.id = id
    this.binWidth = width
    this.binHeight = height
    this.freeRects = [{ x: 0, y: 0, w: width, h: height }]
    this.usedRects = []
  }

  /**
   * Common interval length between two 1D segments.
   * Used by Contact Point heuristic to measure adjacency.
   * Ported from Jylänki's CommonIntervalLength().
   */
  private commonIntervalLength(s1: number, e1: number, s2: number, e2: number): number {
    if (e1 <= s2 || e2 <= s1) return 0
    return Math.min(e1, e2) - Math.max(s1, s2)
  }

  /**
   * Contact Point score — total edge length touching bin walls or placed rects.
   * Ported from Jylänki's ContactPointScoreNode().
   */
  private contactPointScore(x: number, y: number, w: number, h: number): number {
    let score = 0
    if (x <= 0.001 || x + w >= this.binWidth - 0.001) score += h
    if (y <= 0.001 || y + h >= this.binHeight - 0.001) score += w
    for (const u of this.usedRects) {
      // Vertical adjacency (left/right edges touching)
      if (Math.abs(u.x + u.w - x) < 0.001 || Math.abs(u.x - (x + w)) < 0.001) {
        score += this.commonIntervalLength(u.y, u.y + u.h, y, y + h)
      }
      // Horizontal adjacency (top/bottom edges touching)
      if (Math.abs(u.y + u.h - y) < 0.001 || Math.abs(u.y - (y + h)) < 0.001) {
        score += this.commonIntervalLength(u.x, u.x + u.w, x, x + w)
      }
    }
    return score
  }

  /**
   * Score a rectangle placement using any of the 5 heuristics.
   * Tries both orientations (normal + rotated) and returns the best.
   *
   * Scoring formulas from Jylänki's FindPositionForNewNode* functions:
   * - BSSF: min(leftH, leftV), max(leftH, leftV)
   * - BLSF: max(leftH, leftV), min(leftH, leftV)
   * - BAF:  freeArea - itemArea, min(leftH, leftV)
   * - BL:   freeY + itemH, freeX
   * - CP:   -contactLength, 0
   */
  scoreRect(
    w: number,
    h: number,
    heuristic: HeuristicType,
    allowRotation = true
  ): ScoreResult | null {
    let best: ScoreResult | null = null
    let bestS1 = Infinity
    let bestS2 = Infinity

    const tryFit = (tw: number, th: number, rot: boolean) => {
      for (const r of this.freeRects) {
        if (r.w < tw - 0.001 || r.h < th - 0.001) continue

        let s1: number
        let s2: number
        const leftH = r.w - tw
        const leftV = r.h - th

        switch (heuristic) {
          case "bssf":
            s1 = Math.min(leftH, leftV)
            s2 = Math.max(leftH, leftV)
            break
          case "blsf":
            s1 = Math.max(leftH, leftV)
            s2 = Math.min(leftH, leftV)
            break
          case "baf":
            s1 = r.w * r.h - tw * th
            s2 = Math.min(leftH, leftV)
            break
          case "bl":
            s1 = r.y + th
            s2 = r.x
            break
          case "cp":
            s1 = -this.contactPointScore(r.x, r.y, tw, th)
            s2 = 0
            break
        }

        if (s1 < bestS1 - 0.001 || (Math.abs(s1 - bestS1) < 0.001 && s2 < bestS2 - 0.001)) {
          bestS1 = s1
          bestS2 = s2
          best = {
            x: r.x,
            y: r.y,
            w: tw,
            h: th,
            score1: s1,
            score2: s2,
            rotated: rot,
          }
        }
      }
    }

    tryFit(w, h, false)
    if (allowRotation && Math.abs(w - h) > 0.001) {
      tryFit(h, w, true)
    }

    return best
  }

  /**
   * Place an item and split all overlapping free rects.
   * Ported from Jylänki's SplitFreeNode + PruneFreeList.
   */
  place(x: number, y: number, w: number, h: number): void {
    this.usedRects.push({ x, y, w, h })

    const right = x + w
    const bottom = y + h
    const newRects: FreeRect[] = []

    for (const rr of this.freeRects) {
      const rx = rr.x
      const ry = rr.y
      const rw = rr.w
      const rh = rr.h
      const rRight = rx + rw
      const rBottom = ry + rh

      // SAT — no overlap
      if (
        right <= rx + 0.001 ||
        x >= rRight - 0.001 ||
        bottom <= ry + 0.001 ||
        y >= rBottom - 0.001
      ) {
        newRects.push(rr)
        continue
      }

      // Split into up to 4 maximal remainders
      if (x > rx + 0.001) newRects.push({ x: rx, y: ry, w: x - rx, h: rh })
      if (right < rRight - 0.001) newRects.push({ x: right, y: ry, w: rRight - right, h: rh })
      if (y > ry + 0.001) newRects.push({ x: rx, y: ry, w: rw, h: y - ry })
      if (bottom < rBottom - 0.001) newRects.push({ x: rx, y: bottom, w: rw, h: rBottom - bottom })
    }

    // Prune: remove tiny rects and those fully contained by another
    const valid = newRects.filter((r) => r.w >= 0.25 && r.h >= 0.25)
    valid.sort((a, b) => b.w * b.h - a.w * a.h)
    const pruned: FreeRect[] = []
    for (const rect of valid) {
      const contained = pruned.some(
        (j) =>
          rect.x >= j.x - 0.001 &&
          rect.y >= j.y - 0.001 &&
          rect.x + rect.w <= j.x + j.w + 0.001 &&
          rect.y + rect.h <= j.y + j.h + 0.001
      )
      if (!contained) pruned.push(rect)
    }
    this.freeRects = pruned
  }
}

// ---------------------------------------------------------------------------
// Batch insertion — ported from Jylänki's Insert() + rectpack's PackerGlobal
// ---------------------------------------------------------------------------

/**
 * Fill a single bin by repeatedly picking the best-fitting remaining item.
 * This is the key insight from both Jylänki (batch Insert) and rectpack
 * (PackerGlobal): instead of processing items in a fixed sort order,
 * evaluate ALL remaining items at each step and pick the globally best
 * (item, position) pair. O(n²×F) but dramatically better packing.
 */
export function batchFillBin(
  bin: MaxRectBin,
  items: PackableItem[],
  remaining: Set<number>,
  heuristic: HeuristicType
): Placement[] {
  const placements: Placement[] = []

  while (remaining.size > 0) {
    let bestIdx = -1
    let bestResult: ScoreResult | null = null
    let bestS1 = Infinity
    let bestS2 = Infinity

    for (const idx of remaining) {
      const item = items[idx]
      const rs = item.item.renderShape
      const allowRot = rs !== "trapezoid" && rs !== "sector"
      const result = bin.scoreRect(item.w, item.h, heuristic, allowRot)
      if (
        result &&
        (result.score1 < bestS1 - 0.001 ||
          (Math.abs(result.score1 - bestS1) < 0.001 && result.score2 < bestS2 - 0.001))
      ) {
        bestS1 = result.score1
        bestS2 = result.score2
        bestIdx = idx
        bestResult = result
      }
    }

    if (bestIdx < 0 || !bestResult) break

    bin.place(bestResult.x, bestResult.y, bestResult.w, bestResult.h)
    placements.push({
      binIndex: bin.id,
      x: bestResult.x,
      y: bestResult.y,
      w: bestResult.w,
      h: bestResult.h,
      rotated: bestResult.rotated,
      itemIndex: items[bestIdx].index,
    })
    remaining.delete(bestIdx)
  }

  return placements
}

/**
 * Global batch packing: fill bins one at a time using batch insertion.
 * Ported from rectpack's PackerGlobal strategy.
 */
function globalBatchPack(
  items: PackableItem[],
  binW: number,
  binH: number,
  maxBins: number,
  heuristic: HeuristicType
): { placements: Placement[]; bins: MaxRectBin[] } {
  const bins: MaxRectBin[] = []
  const allPlacements: Placement[] = []
  const remaining = new Set(items.map((_, i) => i))

  while (remaining.size > 0 && bins.length < maxBins) {
    const bin = new MaxRectBin(bins.length, binW, binH)
    const placed = batchFillBin(bin, items, remaining, heuristic)
    if (placed.length === 0) break
    bins.push(bin)
    allPlacements.push(...placed)
  }

  return { placements: allPlacements, bins }
}

// ---------------------------------------------------------------------------
// Sort-based greedy packing with BBF bin selection
// ---------------------------------------------------------------------------

/**
 * Greedy packing: process items in sort order, use Bin Best Fit selection.
 * For each item, tries ALL existing bins and picks the one with the best
 * score. Opens a new bin only when no existing bin can fit.
 * Ported from rectpack's PackerBBFMixin.
 */
function globalGreedyPack(
  sorted: PackableItem[],
  binW: number,
  binH: number,
  maxBins: number,
  heuristic: HeuristicType
): { placements: Placement[]; bins: MaxRectBin[] } {
  const bins: MaxRectBin[] = []
  const placements: Placement[] = []

  for (const item of sorted) {
    let bestBin: MaxRectBin | null = null
    let bestResult: ScoreResult | null = null
    let bestS1 = Infinity
    let bestS2 = Infinity
    const rs = item.item.renderShape
    const allowRot = rs !== "trapezoid" && rs !== "sector"

    // BBF: try all bins, pick best fit
    for (const bin of bins) {
      const result = bin.scoreRect(item.w, item.h, heuristic, allowRot)
      if (
        result &&
        (result.score1 < bestS1 - 0.001 ||
          (Math.abs(result.score1 - bestS1) < 0.001 && result.score2 < bestS2 - 0.001))
      ) {
        bestS1 = result.score1
        bestS2 = result.score2
        bestBin = bin
        bestResult = result
      }
    }

    if (bestBin && bestResult) {
      bestBin.place(bestResult.x, bestResult.y, bestResult.w, bestResult.h)
      placements.push({
        binIndex: bestBin.id,
        x: bestResult.x,
        y: bestResult.y,
        w: bestResult.w,
        h: bestResult.h,
        rotated: bestResult.rotated,
        itemIndex: item.index,
      })
    } else if (bins.length < maxBins) {
      const bin = new MaxRectBin(bins.length, binW, binH)
      const result = bin.scoreRect(item.w, item.h, heuristic, allowRot)
      if (result) {
        bin.place(result.x, result.y, result.w, result.h)
        bins.push(bin)
        placements.push({
          binIndex: bin.id,
          x: result.x,
          y: result.y,
          w: result.w,
          h: result.h,
          rotated: result.rotated,
          itemIndex: item.index,
        })
      }
    }
  }

  return { placements, bins }
}

// ---------------------------------------------------------------------------
// Exhaustive rotation search — minimize occupied height on last sheet
// ---------------------------------------------------------------------------

function exhaustiveRotationSearch(
  items: PackableItem[],
  binW: number,
  binH: number,
  heuristic: HeuristicType
): { placements: Placement[]; occupiedHeight: number } | null {
  const n = items.length
  if (n === 0) return null

  // Only non-square, non-oriented items contribute to rotation search.
  // Trapezoids and sectors have semantic geometry fields (topWidth/bottomWidth,
  // innerRadius/outerRadius) that are perpendicular to height — rotating them
  // 90° produces inconsistent PreviewItem state and broken rendering.
  const rotatableIndices: number[] = []
  for (let i = 0; i < n; i++) {
    const rs = items[i].item.renderShape
    const isOriented = rs === "trapezoid" || rs === "sector"
    if (!isOriented && Math.abs(items[i].w - items[i].h) > 0.001) rotatableIndices.push(i)
  }
  const effectiveN = rotatableIndices.length
  const maxExhaustive = 14
  const totalCombos = effectiveN <= maxExhaustive ? 1 << effectiveN : 0

  let bestPlacements: Placement[] = []
  let bestHeight = Infinity

  const tryPacking = (
    orientedItems: PackableItem[]
  ): { placements: Placement[]; height: number } => {
    const bin = new MaxRectBin(0, binW, binH)
    const result: Placement[] = []
    let maxY = 0

    for (const item of orientedItems) {
      // Rotation disabled — the mask already controls orientation
      const fit = bin.scoreRect(item.w, item.h, heuristic, false)
      if (!fit) continue

      bin.place(fit.x, fit.y, fit.w, fit.h)
      result.push({
        binIndex: 0,
        x: fit.x,
        y: fit.y,
        w: fit.w,
        h: fit.h,
        // Compare placed width vs original spec width to detect rotation
        rotated: Math.abs(fit.w - item.item.width) > 0.001,
        itemIndex: item.index,
      })
      maxY = Math.max(maxY, fit.y + fit.h)
    }
    return { placements: result, height: maxY }
  }

  // Exhaustive search over rotation masks
  if (totalCombos > 0) {
    for (let mask = 0; mask < totalCombos; mask++) {
      const oriented = items.map((item) => ({ ...item }))
      for (let bit = 0; bit < effectiveN; bit++) {
        if ((mask >> bit) & 1) {
          const idx = rotatableIndices[bit]
          const orig = oriented[idx]
          oriented[idx] = { ...orig, w: orig.h, h: orig.w }
        }
      }
      oriented.sort((a, b) => b.h - a.h || b.w - a.w)
      const result = tryPacking(oriented)
      if (result.placements.length === n && result.height < bestHeight) {
        bestHeight = result.height
        bestPlacements = result.placements
      }
    }
  }

  // Also try greedy with 4 sort orders as fallback
  const sortFns: Array<(a: PackableItem, b: PackableItem) => number> = [
    (a, b) => b.w * b.h - a.w * a.h,
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h,
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
  ]
  for (const sortFn of sortFns) {
    const sorted = [...items].sort(sortFn)
    const result = tryPacking(sorted)
    if (result.placements.length === n && result.height < bestHeight) {
      bestHeight = result.height
      bestPlacements = result.placements
    }
  }

  if (bestPlacements.length === 0) return null
  return { placements: bestPlacements, occupiedHeight: bestHeight }
}

// ---------------------------------------------------------------------------
// Build SheetPreview from placements
// ---------------------------------------------------------------------------

function buildSheetFromPlacements(
  placements: Placement[],
  sortedItems: (PreviewItem & { usedArea: number })[],
  rollW: number,
  rollL: number,
  sheetIndex: number,
  isPartial: boolean
): SheetPreview {
  // Clamp placements so items never exceed stock bounds
  const clampedPlacements = placements.map((p) => {
    const cw = Math.min(p.w, rollW - p.x)
    const ch = Math.min(p.h, rollL - p.y)
    const cx = Math.max(0, Math.min(p.x, rollW - cw))
    const cy = Math.max(0, Math.min(p.y, rollL - ch))
    return { ...p, x: cx, y: cy, w: cw, h: ch }
  })

  const placedItems: PreviewItem[] = clampedPlacements.map((p) => {
    const original = sortedItems[p.itemIndex]
    const item: PreviewItem = {
      ...original,
      x: p.x,
      y: p.y,
      width: p.w,
      height: p.h,
      rotated90: p.rotated ? !(original.rotated90 ?? false) : (original.rotated90 ?? false),
      flipped: p.rotated ? !(original.flipped ?? false) : (original.flipped ?? false),
    }

    // Trapezoids must render in their original upright orientation regardless of
    // how the MaxRects solver rotated them for packing.  Restore the original
    // dimensions so TrapezoidShape draws the correct top/bottom edge widths.
    if (original.renderShape === "trapezoid" && original.topWidth != null) {
      item.width = Math.max(original.topWidth, original.bottomWidth ?? original.topWidth)
      item.height = original.height
      item.rotated90 = false
      item.rotation = 0
      item.flipped = false
      item.placedPolygon = undefined
    }

    return item
  })

  const usedArea = clampedPlacements.reduce((sum, p) => sum + sortedItems[p.itemIndex].usedArea, 0)
  const bounds = getPlacementBounds(placedItems)

  // Reconstruct free rects by replaying placements on a fresh bin
  const bin = new MaxRectBin(0, rollW, rollL)
  for (const p of clampedPlacements) {
    bin.place(p.x, p.y, p.w, p.h)
  }

  // Classify free rects as reusable offcuts vs scrap.
  // A band is reusable when its narrower side >= 20" and at least one
  // item from the cut list actually fits inside it.  Thin edge strips and
  // small inter-item gaps fall below the 20" threshold → waste.
  const MIN_REUSABLE_DIM = 20
  const offcutBands: OffcutBand[] = []
  const scrapBands: OffcutBand[] = []
  let reusableArea = 0
  let scrapArea = 0

  for (const fr of bin.freeRects) {
    const band: OffcutBand = { x: fr.x, y: fr.y, width: fr.w, height: fr.h }
    const bandArea = fr.w * fr.h
    const minDim = Math.min(fr.w, fr.h)
    const isReusable =
      minDim >= MIN_REUSABLE_DIM &&
      sortedItems.some((item) => countPieceFitsInBand(band, item.width, item.height) > 0)
    if (isReusable) {
      offcutBands.push(band)
      reusableArea += bandArea
    } else {
      scrapBands.push(band)
      scrapArea += bandArea
    }
  }

  const intraWaste = placedItems.reduce((sum, item) => sum + computeIntraBlankWaste(item), 0)

  // MaxRects free rects overlap (maximal rectangles share area), so raw sums
  // inflate reusable + scrap totals.  Compute the true free area from the
  // stock area minus the used area, then split proportionally.
  const stockArea = rollW * rollL
  const actualFreeArea = Math.max(0, stockArea - usedArea)
  const rawTotal = reusableArea + scrapArea
  let correctedReusable: number
  let correctedScrap: number
  if (rawTotal > 0) {
    correctedReusable = actualFreeArea * (reusableArea / rawTotal)
    correctedScrap = actualFreeArea - correctedReusable + intraWaste
  } else {
    correctedReusable = 0
    correctedScrap = actualFreeArea + intraWaste
  }
  const wasteArea = correctedReusable + correctedScrap

  const preview: RectLikePreview = {
    renderShape: placedItems[0]?.renderShape === "circle" ? "rect" : (placedItems[0]?.renderShape ?? "rect"),
    strategyName: "Global-optimized layout",
    strategyNote:
      "Items globally assigned across sheets using MaxRects with all 5 heuristics (BSSF/BLSF/BAF/BL/CP) and batch insertion for minimal waste.",
    placementMode: "origin",
    wasteMode: "bands",
    cutPlanTitle: "Cut sequence",
    cutSteps: [
      {
        title: "Rough-cut the selected blanks in placement order",
        detail:
          "The preview globally optimizes item placement across all sheets for minimal waste.",
      },
      {
        title: "Finish each profile from its placed blank",
        detail:
          "Non-rectangular parts show their blank scrap directly so the cutter can see where the finished profile comes out of each placement.",
      },
    ],
    requestedUnits: placedItems.length,
    unitsCompleted: placedItems.length,
    overflowUnits: 0,
    piecesShown: placedItems.length,
    piecesPerUnit: 1,
    usedArea,
    wasteArea,
    wastePct: stockArea > 0 ? (wasteArea / stockArea) * 100 : 100,
    reusableArea: correctedReusable,
    scrapArea: correctedScrap,
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
    items: placedItems,
    offcutBands,
    scrapBands,
    placements: placedItems,
    label: placedItems[0]?.label ?? "",
  }

  return { sheetIndex, preview, isPartial }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function globalMultiSheetPack(
  specs: SimplePartSpec[],
  rollW: number,
  rollL: number,
  maxSheets: number,
  fallbackWidth: number,
  fallbackHeight: number
): MultiSheetResult {
  const stockArea = rollW * rollL

  // Build all items from specs (expand quantities)
  const allItems = specs.flatMap((spec) =>
    Array.from({ length: Math.max(1, spec.quantity || 1) }, () =>
      buildPartPreviewItem(spec, fallbackWidth, fallbackHeight)
    )
  )

  if (allItems.length === 0) {
    return {
      sheets: [],
      totalUnitsCompleted: 0,
      totalUsedArea: 0,
      totalReusableArea: 0,
      totalScrapArea: 0,
      totalStockArea: 0,
      remainingOverflow: 0,
      avgFabScore: 0,
    }
  }

  const basePackItems: PackableItem[] = allItems.map((item, i) => ({
    index: i,
    w: item.width,
    h: item.height,
    item,
  }))

  // All 5 heuristics from Jylänki's paper
  const heuristics: HeuristicType[] = ["bssf", "blsf", "baf", "bl", "cp"]

  // Sort strategies from rectpack (for greedy mode)
  const sortFns: Array<{
    fn: (a: PackableItem, b: PackableItem) => number
  }> = [
    { fn: (a, b) => b.w * b.h - a.w * a.h },
    { fn: (a, b) => b.h - a.h || b.w * b.h - a.w * a.h },
    { fn: (a, b) => b.w - a.w || b.w * b.h - a.w * a.h },
    {
      fn: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
    },
    { fn: (a, b) => b.w + b.h - (a.w + a.h) || b.w * b.h - a.w * a.h },
    {
      fn: (a, b) => {
        const bandA = Math.round(a.w / 5) * 5
        const bandB = Math.round(b.w / 5) * 5
        if (bandA !== bandB) return bandB - bandA
        return b.h - a.h || b.w * b.h - a.w * a.h
      },
    },
  ]

  // Both bin orientations
  const binOrientations: Array<{
    bw: number
    bh: number
    swapped: boolean
  }> = [{ bw: rollW, bh: rollL, swapped: false }]
  if (Math.abs(rollW - rollL) > 1) {
    binOrientations.push({ bw: rollL, bh: rollW, swapped: true })
  }

  let bestResult: MultiSheetResult | null = null
  let bestPlaced = 0
  let bestSheetCount = Infinity
  let bestOccupiedHeight = Infinity

  const evaluateCandidate = (
    placements: Placement[],
    _bins: MaxRectBin[],
    binW: number,
    binH: number,
    swapped: boolean,
    heuristic: HeuristicType
  ) => {
    // Group placements by bin
    const binGroups = new Map<number, Placement[]>()
    for (const p of placements) {
      const group = binGroups.get(p.binIndex) ?? []
      group.push(p)
      binGroups.set(p.binIndex, group)
    }

    const binIds = [...binGroups.keys()].sort((a, b) => a - b)
    if (binIds.length === 0) return

    // Exhaustive rotation search on the last bin
    const lastBinId = binIds[binIds.length - 1]
    const lastBinPlacements = binGroups.get(lastBinId)
    if (!lastBinPlacements) return
    const lastBinItems = lastBinPlacements.map((p) => basePackItems[p.itemIndex])

    // maxExhaustive=14 inside exhaustiveRotationSearch; items beyond that
    // count fall back to greedy sort orders only (still beneficial)
    if (lastBinItems.length > 0) {
      const optimized = exhaustiveRotationSearch(lastBinItems, binW, binH, heuristic)
      if (optimized && optimized.placements.length === lastBinItems.length) {
        binGroups.set(lastBinId, optimized.placements)
      }
    }

    // Transform swapped coordinates back to original
    if (swapped) {
      for (const binId of binIds) {
        const group = binGroups.get(binId) ?? []
        binGroups.set(
          binId,
          group.map((p) => ({
            ...p,
            x: p.y,
            y: p.x,
            w: p.h,
            h: p.w,
            rotated: !p.rotated,
          }))
        )
      }
    }

    // Build sheets
    const sheets: SheetPreview[] = []
    for (let si = 0; si < binIds.length; si++) {
      const binId = binIds[si]
      const binPlacements = binGroups.get(binId) ?? []
      const isLast = si === binIds.length - 1
      sheets.push(buildSheetFromPlacements(binPlacements, allItems, rollW, rollL, si, isLast))
    }

    const totalUnitsCompleted = sheets.reduce((s, sh) => s + sh.preview.unitsCompleted, 0)
    const totalUsedArea = sheets.reduce((s, sh) => s + sh.preview.usedArea, 0)
    const totalReusableArea = sheets.reduce((s, sh) => s + sh.preview.reusableArea, 0)
    const totalScrapArea = sheets.reduce((s, sh) => s + sh.preview.scrapArea, 0)
    const remainingOverflow = Math.max(0, allItems.length - totalUnitsCompleted)
    const fabScores = sheets.map((sh) => computeFabricationScore(sh.preview, rollW, rollL).score)
    const avgFabScore =
      fabScores.length > 0 ? Math.round(fabScores.reduce((a, b) => a + b, 0) / fabScores.length) : 0

    const result: MultiSheetResult = {
      sheets,
      totalUnitsCompleted,
      totalUsedArea,
      totalReusableArea,
      totalScrapArea,
      totalStockArea: stockArea * sheets.length,
      remainingOverflow,
      avgFabScore,
    }

    // Compare: most items placed → fewest sheets → tightest packing.
    // Use total occupied height as tiebreaker — classification-independent.
    const totalOccupied = sheets.reduce((s, sh) => s + sh.preview.occupiedHeight, 0)
    const betterPlaced = totalUnitsCompleted > bestPlaced
    const samePlaced = totalUnitsCompleted === bestPlaced
    const fewerSheets = sheets.length < bestSheetCount
    const sameSheets = sheets.length === bestSheetCount
    const tighterPacking = totalOccupied < bestOccupiedHeight

    if (
      betterPlaced ||
      (samePlaced && fewerSheets) ||
      (samePlaced && sameSheets && tighterPacking)
    ) {
      bestResult = result
      bestPlaced = totalUnitsCompleted
      bestSheetCount = sheets.length
      bestOccupiedHeight = totalOccupied
    }
  }

  // =========================================================================
  // Mode 1: Batch insertion (Jylänki Insert + rectpack Global)
  // 5 heuristics × 2 orientations = 10 candidates
  // =========================================================================
  for (const { bw, bh, swapped } of binOrientations) {
    for (const heuristic of heuristics) {
      const { placements, bins } = globalBatchPack(basePackItems, bw, bh, maxSheets, heuristic)
      evaluateCandidate(placements, bins, bw, bh, swapped, heuristic)
    }
  }

  // =========================================================================
  // Mode 2: Sort-based greedy with BBF bin selection
  // 5 heuristics × 6 sorts × 2 orientations = 60 candidates
  // =========================================================================
  for (const { bw, bh, swapped } of binOrientations) {
    for (const { fn } of sortFns) {
      for (const heuristic of heuristics) {
        const sorted = [...basePackItems].sort(fn)
        const { placements, bins } = globalGreedyPack(sorted, bw, bh, maxSheets, heuristic)
        evaluateCandidate(placements, bins, bw, bh, swapped, heuristic)
      }
    }
  }

  // =========================================================================
  // Mode 3: Width-pair packing
  // 5 heuristics × 2 orientations = 10 candidates
  // =========================================================================
  for (const { bw, bh, swapped } of binOrientations) {
    for (const heuristic of heuristics) {
      const { placements, bins } = globalWidthPairPack(basePackItems, bw, bh, maxSheets, heuristic)
      if (placements.length > 0) {
        evaluateCandidate(placements, bins, bw, bh, swapped, heuristic)
      }
    }
  }

  return (
    bestResult ?? {
      sheets: [],
      totalUnitsCompleted: 0,
      totalUsedArea: 0,
      totalReusableArea: 0,
      totalScrapArea: 0,
      totalStockArea: 0,
      remainingOverflow: allItems.length,
      avgFabScore: 0,
    }
  )
}
