// Re-pack strategies that wrap the raw `globalMultiSheetPack` (MaxRects/AABB)
// to recover NFP-fan / interlock density on sheets where the global packer's
// bounding-box assumptions degraded the layout. See GitHub issue #119.
//
// Two strategies, attempted in order:
//
//   1. `tryFullJobNfpRepack` (Plan A) — for jobs that mix cones/trapezoids
//      with rectangles, pool ALL items, NFP-pack the cone/trapezoid items
//      across as few sheets as possible, then gap-fill the rectangles into
//      the resulting reusable offcut bands. Wins when the rect fits inside
//      a cone fan's bottom strip — recovers a full sheet vs the AABB layout.
//
//   2. `rePackHomogeneousOverflowSheets` (v1 fallback) — for jobs where
//      Plan A doesn't apply (no rects, or full-job re-pack would increase
//      sheet count), re-pack only the OVERFLOW sheets (sheets 1..N) when
//      they're already pure-cone or pure-trapezoid. Sheet 0 preserved.
//
// Both strategies fall back to the raw global packer's result if their
// acceptance gates fail — guaranteed no regression vs the pre-fix output.

import type {
  MultiSheetResult,
  PreviewItem,
  SheetPreview,
  SimplePartPreview,
  SimplePartSpec,
} from "./nesting-visualizer-types"
import { globalMultiSheetPack as _globalMultiSheetPack } from "./nesting-global-packer-entry"
import { generateConePreview, generateTrapezoidPreview } from "./nesting-shape-previews-advanced"
import {
  generateMultiPartPreview,
  reduceSpecsByPlacedItems,
  tryGapFillSheet,
} from "./nesting-shape-previews-dispatch"
import { computeFabricationScore } from "./nesting-preview-builders"

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Cap on overflow sheets eligible for NFP re-pack. Sync NFP runs on the
 *  main thread per sheet; this bound keeps worst-case CPU predictable for
 *  pathological jobs while still covering normal operator scenarios. */
const MAX_REPACK_SHEETS = 10

/** Cap on total item count eligible for the full-job (Plan A) re-pack. NFP
 *  cost scales with item count; for very large jobs we keep the cheaper v1
 *  overflow-only re-pack instead. */
const MAX_ITEMS_FOR_FULL_REPACK = 200

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function specCountsByOriginalIndex(items: PreviewItem[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const item of items) {
    const key = item.specIndex
    if (key == null) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/**
 * Group items by `_originalSpecIndex` (fallback `specIndex`). For each
 * group, find the matching original spec by `_originalSpecIndex` first,
 * fallback to local position. Preserves issue #121 identity invariants:
 * distinct specs that share dimensions (e.g. two cones with different
 * partNumbers) stay distinct in the re-packed output.
 */
function buildPooledSpecsFromItems(
  items: PreviewItem[],
  originalSpecs: SimplePartSpec[]
): SimplePartSpec[] {
  const counts = specCountsByOriginalIndex(items)
  const pooled: SimplePartSpec[] = []
  for (const [origIdx, qty] of counts) {
    const matched =
      originalSpecs.find((s) => s._originalSpecIndex === origIdx) ?? originalSpecs[origIdx]
    if (!matched) continue
    pooled.push({ ...matched, quantity: qty })
  }
  return pooled
}

function isHomogeneousOverflowSheet(sheet: SheetPreview): boolean {
  const items = sheet.preview.items
  if (items.length === 0) return false
  const allSector = items.every((it) => it.renderShape === "sector")
  const allTrap = items.every((it) => it.renderShape === "trapezoid")
  return allSector || allTrap
}

/**
 * Generate a single-sheet preview using the most NFP-aware entry point for
 * the given spec set:
 *
 * - Single cone spec → `generateConePreview` (dedicated NFP fan).
 * - Single trapezoid spec → `generateTrapezoidPreview` (interleave-aware).
 * - Multi-spec → `generateMultiPartPreview(..., false)` (mixed-NFP / hybrid).
 *
 * `generateMultiPartPreview` falls through to shelf packing when given a
 * single cone or trapezoid spec because `useMixedNfp` requires
 * `simpleParts.length > 1`. Calling the dedicated single-spec generator
 * avoids that fall-through and recovers the fan / interlock pattern.
 */
function generateNfpPreviewForSpecs(
  specs: SimplePartSpec[],
  rollW: number,
  rollL: number,
  fallbackWidth: number,
  fallbackHeight: number
): SimplePartPreview {
  if (specs.length === 1) {
    const spec = specs[0]
    const qty = Math.max(1, spec.quantity || 1)
    let preview: SimplePartPreview | null = null
    if (spec.partType === "cone") {
      preview = generateConePreview(
        rollW,
        rollL,
        spec.innerRadius ?? Math.max(1, fallbackWidth / 2),
        spec.outerRadius ?? Math.max(2, fallbackHeight),
        spec.arcDegrees ?? 120,
        qty,
        spec.cutDirection,
        spec.cutRatios,
        undefined,
        false
      )
    } else if (spec.partType === "trapezoid") {
      preview = generateTrapezoidPreview(
        rollW,
        rollL,
        spec.topWidth ?? fallbackWidth,
        spec.bottomWidth ?? fallbackWidth,
        spec.height ?? fallbackHeight,
        qty,
        spec.cutDirection,
        spec.cutRatios,
        undefined,
        false
      )
    }
    if (preview) {
      // Single-spec generators don't take a spec object, so they don't stamp
      // `specIndex`/`partNumber` on placed items. Apply the identity from the
      // pooled spec so downstream tag-map / overflow accounting (issue #121)
      // stays correct.
      const stampedItems = preview.items.map((item) => ({
        ...item,
        specIndex: spec._originalSpecIndex ?? item.specIndex,
        partNumber: spec.partNumber ?? item.partNumber,
      }))
      return { ...preview, items: stampedItems, placements: stampedItems } as SimplePartPreview
    }
  }
  return generateMultiPartPreview(rollW, rollL, specs, fallbackWidth, fallbackHeight, false)
}

/**
 * NFP-pack the given specs across as many sheets as needed (capped by
 * `MAX_REPACK_SHEETS`). Each sheet runs through the NFP-aware dispatch and
 * remaining quantities decrement after each placement. Returns the produced
 * `SheetPreview` list (sheetIndex starts at 0; caller is responsible for
 * re-numbering when splicing into a larger result).
 */
function expandNfpSheets(
  pooledSpecs: SimplePartSpec[],
  rollW: number,
  rollL: number,
  fallbackWidth: number,
  fallbackHeight: number,
  sheetCap: number
): SheetPreview[] {
  const sheets: SheetPreview[] = []
  let remainingPool = pooledSpecs.map((s) => ({ ...s }))
  let capacityPerSheet = 0
  while (sheets.length < sheetCap) {
    const activeSpecs = remainingPool.filter((s) => (s.quantity ?? 0) > 0)
    if (activeSpecs.length === 0) break
    const preview = generateNfpPreviewForSpecs(
      activeSpecs,
      rollW,
      rollL,
      fallbackWidth,
      fallbackHeight
    )
    if (preview.unitsCompleted === 0) break
    if (capacityPerSheet === 0) capacityPerSheet = preview.unitsCompleted
    const isPartial = preview.unitsCompleted < capacityPerSheet
    sheets.push({ sheetIndex: sheets.length, preview, isPartial })
    remainingPool = reduceSpecsByPlacedItems(remainingPool, preview.items).filter(
      (s) => (s.quantity ?? 0) > 0
    )
  }
  return sheets
}

/**
 * Acceptance gate shared by both re-pack strategies. Every original spec must
 * keep at least its original count. Returns null if accepted, or a debug
 * message describing the regressing spec when rejected.
 */
function checkPerSpecMultiset(
  originalCounts: Map<number, number>,
  newCounts: Map<number, number>
): string | null {
  for (const [origIdx, requiredQty] of originalCounts) {
    const placedQty = newCounts.get(origIdx) ?? 0
    if (placedQty < requiredQty) {
      return `spec ${origIdx} placed ${placedQty}/${requiredQty}`
    }
  }
  return null
}

/**
 * Rebuild the top-level `MultiSheetResult` aggregates from a possibly-spliced
 * sheet list. Re-numbers `sheetIndex` to a contiguous 0..N-1 sequence so
 * downstream renderers don't see stale indices.
 */
function rebuildResult(
  sheets: SheetPreview[],
  originalSpecs: SimplePartSpec[],
  rollW: number,
  rollL: number
): MultiSheetResult {
  const renumbered = sheets.map((sh, i) => ({ ...sh, sheetIndex: i }))
  const stockArea = rollW * rollL
  const totalUnitsCompleted = renumbered.reduce((s, sh) => s + sh.preview.unitsCompleted, 0)
  const totalUsedArea = renumbered.reduce((s, sh) => s + sh.preview.usedArea, 0)
  const totalReusableArea = renumbered.reduce((s, sh) => s + sh.preview.reusableArea, 0)
  const totalScrapArea = renumbered.reduce((s, sh) => s + sh.preview.scrapArea, 0)
  const totalNeeded = originalSpecs.reduce((s, sp) => s + Math.max(0, sp.quantity ?? 0), 0)
  const remainingOverflow = Math.max(0, totalNeeded - totalUnitsCompleted)
  const fabScores = renumbered.map((sh) => computeFabricationScore(sh.preview, rollW, rollL).score)
  const avgFabScore =
    fabScores.length > 0 ? Math.round(fabScores.reduce((a, b) => a + b, 0) / fabScores.length) : 0
  return {
    sheets: renumbered,
    totalUnitsCompleted,
    totalUsedArea,
    totalReusableArea,
    totalScrapArea,
    totalStockArea: stockArea * renumbered.length,
    remainingOverflow,
    avgFabScore,
  }
}

// ---------------------------------------------------------------------------
// Strategy 1 — Plan A: full-job NFP with rect gap-fill
// ---------------------------------------------------------------------------

/**
 * For mixed jobs with cones/trapezoids AND rectangles, pool ALL items, NFP
 * the cones/trapezoids across as few sheets as possible, then gap-fill the
 * rectangles into the largest reusable offcut on each NFP sheet. Wins the
 * common screenshot scenario: 6 cones + 1 small rect on one sheet (rect
 * tucked into the cone fan's bottom strip) and 6 cones on the next, instead
 * of 4-cones-and-rect AABB on sheet 0 + degraded sheets 1..N.
 *
 * Returns null when:
 *  - The job doesn't qualify (no rects, no shape items, only one sheet, etc.)
 *  - The total item count exceeds `MAX_ITEMS_FOR_FULL_REPACK`
 *  - The repacked layout would use MORE sheets than the raw global packer
 *  - Any spec would lose items vs the original
 */
function tryFullJobNfpRepack(
  result: MultiSheetResult,
  originalSpecs: SimplePartSpec[],
  rollW: number,
  rollL: number,
  fallbackWidth: number,
  fallbackHeight: number,
  sheetCap: number
): MultiSheetResult | null {
  if (result.sheets.length < 2) return null

  const allItems = result.sheets.flatMap((sh) => sh.preview.items)
  if (allItems.length === 0 || allItems.length > MAX_ITEMS_FOR_FULL_REPACK) return null

  // Eligibility: every item must be sector / trapezoid / rect, with at least
  // one rect AND at least one shape (sector or trapezoid). Other shape kinds
  // (circle / cylinder) bail to the v1 fallback.
  const allEligibleKinds = allItems.every(
    (it) =>
      it.renderShape === "sector" || it.renderShape === "trapezoid" || it.renderShape === "rect"
  )
  if (!allEligibleKinds) return null
  const shapeItems = allItems.filter(
    (it) => it.renderShape === "sector" || it.renderShape === "trapezoid"
  )
  const rectItems = allItems.filter((it) => it.renderShape === "rect")
  if (shapeItems.length === 0 || rectItems.length === 0) return null

  // Pool, preserving issue #121 identity (per-spec _originalSpecIndex + partNumber).
  const shapeSpecs = buildPooledSpecsFromItems(shapeItems, originalSpecs)
  const rectSpecs = buildPooledSpecsFromItems(rectItems, originalSpecs)
  if (shapeSpecs.length === 0) return null

  // Phase 1: NFP-pack shape items.
  const shapeSheets = expandNfpSheets(
    shapeSpecs,
    rollW,
    rollL,
    fallbackWidth,
    fallbackHeight,
    sheetCap
  )
  if (shapeSheets.length === 0) return null

  // Phase 2: gap-fill rects into shape sheets, sorted by descending reusable
  // area so we try to place rects into the biggest gaps first (avoids piling
  // rects on the first sheet and leaving later sheets' larger gaps unused).
  //
  // Note: `sortedShapeSheets` is a shallow copy of `shapeSheets`. Reassigning
  // `sheet.preview` mutates the underlying `SheetPreview` objects, which is
  // intentional — the sort only changes iteration order for gap-fill priority
  // and the mutated previews are picked up when `finalSheets` is built from
  // `shapeSheets` below.
  const stockArea = rollW * rollL
  const sortedShapeSheets = [...shapeSheets].sort(
    (a, b) => (b.preview.reusableArea ?? 0) - (a.preview.reusableArea ?? 0)
  )
  let remainingRectSpecs = rectSpecs.map((s) => ({ ...s }))
  for (const sheet of sortedShapeSheets) {
    if (remainingRectSpecs.length === 0) break
    const fill = tryGapFillSheet(sheet.preview, remainingRectSpecs, rollW, rollL, stockArea)
    sheet.preview = fill.preview
    remainingRectSpecs = fill.remainingSpecs
  }

  // Phase 3: any rects that didn't fit get their own sheet (shelf-packed).
  // This is also where we check the sheet-count gate — if appending a rect
  // sheet would exceed the original sheet count, reject the whole re-pack.
  const finalSheets: SheetPreview[] = [...shapeSheets]
  if (remainingRectSpecs.length > 0) {
    const rectSheet = generateMultiPartPreview(
      rollW,
      rollL,
      remainingRectSpecs,
      fallbackWidth,
      fallbackHeight,
      false
    )
    if (rectSheet.unitsCompleted > 0) {
      finalSheets.push({
        sheetIndex: finalSheets.length,
        preview: rectSheet,
        isPartial: rectSheet.overflowUnits > 0,
      })
    }
  }

  // Acceptance gate 1: sheet count must not increase.
  if (finalSheets.length > result.sheets.length) return null

  // Acceptance gate 2: per-spec multiset — no spec loses items.
  const originalCounts = specCountsByOriginalIndex(allItems)
  const newCounts = specCountsByOriginalIndex(finalSheets.flatMap((sh) => sh.preview.items))
  const regression = checkPerSpecMultiset(originalCounts, newCounts)
  if (regression) {
    console.warn(
      `[issue-119] Plan A rejected: ${regression} ` +
        `original=${JSON.stringify([...originalCounts])} ` +
        `repack=${JSON.stringify([...newCounts])}`
    )
    return null
  }

  return rebuildResult(finalSheets, originalSpecs, rollW, rollL)
}

// ---------------------------------------------------------------------------
// Strategy 2 — v1 fallback: overflow-only re-pack (sheet 0 preserved)
// ---------------------------------------------------------------------------

function rePackHomogeneousOverflowSheets(
  result: MultiSheetResult,
  originalSpecs: SimplePartSpec[],
  rollW: number,
  rollL: number,
  fallbackWidth: number,
  fallbackHeight: number,
  sheetCap: number
): MultiSheetResult {
  if (result.sheets.length < 2) return result
  const overflowSheets = result.sheets.slice(1)
  if (overflowSheets.length > sheetCap) return result
  if (!overflowSheets.every(isHomogeneousOverflowSheet)) return result

  const overflowItems = overflowSheets.flatMap((sh) => sh.preview.items)
  const pooledSpecs = buildPooledSpecsFromItems(overflowItems, originalSpecs)
  if (pooledSpecs.length === 0) return result

  const repackedSheets = expandNfpSheets(
    pooledSpecs,
    rollW,
    rollL,
    fallbackWidth,
    fallbackHeight,
    sheetCap
  )

  // Acceptance gate (per-spec multiset, see Plan A's gate 2).
  const originalCounts = specCountsByOriginalIndex(overflowItems)
  const newCounts = specCountsByOriginalIndex(repackedSheets.flatMap((sh) => sh.preview.items))
  const regression = checkPerSpecMultiset(originalCounts, newCounts)
  if (regression) {
    console.warn(
      `[issue-119] overflow re-pack rejected: ${regression} ` +
        `original=${JSON.stringify([...originalCounts])} ` +
        `repack=${JSON.stringify([...newCounts])}`
    )
    return result
  }

  return rebuildResult([result.sheets[0], ...repackedSheets], originalSpecs, rollW, rollL)
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for the raw `globalMultiSheetPack` from
 * `nesting-global-packer-entry.ts`. Runs the raw global packer, then attempts
 * (in order) Plan A (full-job NFP with rect gap-fill) and the v1 fallback
 * (overflow-only re-pack). Returns the first strategy that satisfies its
 * acceptance gates; falls back to the raw result if neither does.
 *
 * See GitHub issue #119 for the full story (Steven's screenshots, the AABB
 * vs NFP distinction, and the per-spec identity invariants from issue #121).
 */
export function globalMultiSheetPack(
  specs: SimplePartSpec[],
  rollW: number,
  rollL: number,
  maxSheets: number,
  fallbackWidth: number,
  fallbackHeight: number
): MultiSheetResult {
  // Honor the caller's `maxSheets` while keeping the engine-wide `MAX_REPACK_SHEETS`
  // CPU guard. Prevents an unbounded `maxSheets` from blowing past the sync-NFP
  // budget, and prevents a tight `maxSheets` from being silently overshot.
  const sheetCap = Math.min(Math.max(1, maxSheets), MAX_REPACK_SHEETS)
  const raw = _globalMultiSheetPack(specs, rollW, rollL, maxSheets, fallbackWidth, fallbackHeight)
  const planA = tryFullJobNfpRepack(
    raw,
    specs,
    rollW,
    rollL,
    fallbackWidth,
    fallbackHeight,
    sheetCap
  )
  if (planA) return planA
  return rePackHomogeneousOverflowSheets(
    raw,
    specs,
    rollW,
    rollL,
    fallbackWidth,
    fallbackHeight,
    sheetCap
  )
}
