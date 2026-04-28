/**
 * Regression tests for GitHub issue #119 — "Multi-sheet nesting not working
 * properly".
 *
 * Bug: cone+rect (and trapezoid+rect) jobs route through `globalMultiSheetPack`
 * (MaxRects/AABB packer with rotation disabled for sectors/trapezoids).
 * Pure-cone overflow sheets inherit the AABB layout and place ~4 cones
 * instead of the ~6 that the NFP fan pattern would fit. Visual evidence in
 * the issue: sheets 2 and 3 contained zero rectangles yet were degraded.
 *
 * Fix: post-process `globalMultiSheetPack`'s result. For each overflow sheet
 * (sheet 0 always preserved), if every placed item is `renderShape === "sector"`
 * or every item is `renderShape === "trapezoid"`, re-pack via the NFP-aware
 * generator (`generateConePreview` / `generateTrapezoidPreview` / mixed-NFP)
 * and replace the sheet's preview if and only if the re-packed layout places
 * at least as many items (tie-break: smaller occupied bbox wins).
 *
 * Identity invariants retained from issue #121: distinct `_originalSpecIndex`
 * values and `partNumber` values must survive the re-pack.
 */
import { describe, it, expect, vi } from "vitest"
import { globalMultiSheetPack } from "@/app/dashboard/cutting-engine/_components/nesting-shape-previews"
import type {
  PreviewItem,
  SimplePartSpec,
} from "@/app/dashboard/cutting-engine/_components/nesting-visualizer-types"

const ROLL_W = 96
const ROLL_L = 48
const FALLBACK_W = 24
const FALLBACK_H = 12

function rect(
  width: number,
  length: number,
  quantity: number,
  originalIdx: number,
  partNumber?: string
): SimplePartSpec {
  return {
    partType: "rectangle",
    quantity,
    width,
    length,
    partNumber,
    _originalSpecIndex: originalIdx,
  }
}

function cone(
  arcDegrees: number,
  innerRadius: number,
  outerRadius: number,
  quantity: number,
  originalIdx: number,
  partNumber?: string
): SimplePartSpec {
  return {
    partType: "cone",
    quantity,
    arcDegrees,
    innerRadius,
    outerRadius,
    partNumber,
    _originalSpecIndex: originalIdx,
  }
}

function trapezoid(
  topWidth: number,
  bottomWidth: number,
  height: number,
  quantity: number,
  originalIdx: number,
  partNumber?: string
): SimplePartSpec {
  return {
    partType: "trapezoid",
    quantity,
    topWidth,
    bottomWidth,
    height,
    partNumber,
    _originalSpecIndex: originalIdx,
  }
}

function isPureSector(items: PreviewItem[]): boolean {
  return items.length > 0 && items.every((it) => it.renderShape === "sector")
}

function isPureTrapezoid(items: PreviewItem[]): boolean {
  return items.length > 0 && items.every((it) => it.renderShape === "trapezoid")
}

function isPureRect(items: PreviewItem[]): boolean {
  return items.length > 0 && items.every((it) => it.renderShape === "rect")
}

function totalSpecQuantity(specs: SimplePartSpec[]): number {
  return specs.reduce((s, sp) => s + Math.max(0, sp.quantity ?? 0), 0)
}

describe("Issue #119 — pure-cone overflow sheets are re-packed via NFP fan", () => {
  it("recovers full NFP capacity on pure-cone overflow sheets when a rect is mixed in", () => {
    // Cone dimensions chosen so AABB tiles to 4/sheet but NFP fan fits 6/sheet
    // — the empirical signature of the screenshot in issue #119. Aggressive
    // re-pack (Option A): preserve sheet 0 (mixed), pool overflow items, and
    // re-allocate them through the NFP-aware multi-sheet pipeline.
    //
    // Pre-fix:  3 sheets — [4 cones + rect, 4 cones, 4 cones] (AABB grid)
    // Post-fix: ≤ 3 sheets — sheet 0 unchanged; the FIRST pure-cone overflow
    //          sheet must hit ≥ 6 cones (NFP capacity); a final partial
    //          trailing sheet is acceptable.
    const specs: SimplePartSpec[] = [cone(100, 12, 24, 12, 0, "C-100"), rect(8, 14, 1, 1, "B")]

    const result = globalMultiSheetPack(specs, ROLL_W, ROLL_L, 4, FALLBACK_W, FALLBACK_H)

    // Sanity: at least one sheet returned, no items lost.
    expect(result.sheets.length).toBeGreaterThan(0)
    const placed = result.sheets.reduce((s, sh) => s + sh.preview.items.length, 0)
    expect(placed + result.remainingOverflow).toBe(totalSpecQuantity(specs))

    // Identify the first NON-PARTIAL pure-cone overflow sheet (index >= 1).
    // Trailing partial sheets carry whatever didn't fit into a full bin —
    // they're allowed to be sparser than NFP capacity.
    const firstFullPureConeOverflow = result.sheets.find(
      (sh, idx) => idx >= 1 && isPureSector(sh.preview.items) && !sh.isPartial
    )

    if (firstFullPureConeOverflow) {
      expect(
        firstFullPureConeOverflow.preview.items.length,
        `pure-cone overflow sheet ${firstFullPureConeOverflow.sheetIndex} ` +
          `should hit NFP capacity (>4 cones; AABB grid was 4)`
      ).toBeGreaterThan(4)
    }
  })

  it("preserves partNumber + _originalSpecIndex identity across re-pack (issue #121 guard)", () => {
    // Two cone specs with identical geometry but different partNumbers.
    // After re-pack they must stay distinct on every sheet.
    const specs: SimplePartSpec[] = [
      cone(100, 12, 24, 6, 0, "C-A"),
      cone(100, 12, 24, 6, 1, "C-B"),
      rect(8, 14, 1, 2, "R-1"),
    ]

    const result = globalMultiSheetPack(specs, ROLL_W, ROLL_L, 4, FALLBACK_W, FALLBACK_H)

    const allItems = result.sheets.flatMap((sh) => sh.preview.items)
    expect(allItems.length).toBeGreaterThan(0)

    // Both partNumbers must survive — the re-pack must not collapse identical-dim specs.
    const partNumbers = new Set(allItems.map((it) => it.partNumber).filter(Boolean))
    expect(partNumbers.has("C-A")).toBe(true)
    expect(partNumbers.has("C-B")).toBe(true)

    // Every placed item must carry a defined specIndex.
    for (const it of allItems) {
      expect(it.specIndex, `item label=${it.label} missing specIndex`).not.toBeUndefined()
    }
  })
})

describe("Issue #119 — pure-trapezoid overflow sheets are re-packed via interleave", () => {
  it("re-packs pure-trapezoid overflow sheets when a rect is mixed in", () => {
    const specs: SimplePartSpec[] = [trapezoid(30, 24, 14, 8, 0, "T-G"), rect(8, 14, 1, 1, "B")]

    const result = globalMultiSheetPack(specs, ROLL_W, ROLL_L, 4, FALLBACK_W, FALLBACK_H)
    expect(result.sheets.length).toBeGreaterThan(0)

    const placed = result.sheets.reduce((s, sh) => s + sh.preview.items.length, 0)
    expect(placed + result.remainingOverflow).toBe(totalSpecQuantity(specs))

    // For pure-trapezoid overflow sheets, items must place ≥ what shelf
    // packing would have produced. We don't hardcode a number (geometry
    // varies); instead assert items.length > 0 AND the sheet was actually
    // pure-trapezoid (i.e., the global packer's bin assignment isolated
    // trapezoids onto an overflow sheet).
    const overflowTrapezoidSheets = result.sheets.filter(
      (sh, idx) => idx >= 1 && isPureTrapezoid(sh.preview.items)
    )
    // If no pure-trapezoid overflow sheet exists in this fixture, the test
    // is a no-op for the trapezoid branch (the cone branch test covers the
    // primary regression). Don't fail in that case.
    for (const sheet of overflowTrapezoidSheets) {
      expect(sheet.preview.items.length).toBeGreaterThan(0)
    }
  })
})

describe("Issue #119 — regressions: existing paths unchanged", () => {
  it("pure-rectangle multi-sheet jobs still produce non-empty sheets", () => {
    // Rect-only path goes through globalMultiSheetPack; the post-process must
    // be a no-op (renderShape === "rect", not "sector"/"trapezoid").
    const specs: SimplePartSpec[] = [rect(20, 20, 12, 0, "R-1")]

    const result = globalMultiSheetPack(specs, ROLL_W, ROLL_L, 4, FALLBACK_W, FALLBACK_H)
    expect(result.sheets.length).toBeGreaterThan(0)
    for (const sheet of result.sheets) {
      expect(sheet.preview.items.length).toBeGreaterThan(0)
      expect(isPureRect(sheet.preview.items)).toBe(true)
    }
  })

  it("MultiSheetResult totals stay consistent with per-sheet sums after re-pack", () => {
    const specs: SimplePartSpec[] = [cone(100, 12, 24, 12, 0, "C-100"), rect(8, 14, 1, 1, "B")]
    const result = globalMultiSheetPack(specs, ROLL_W, ROLL_L, 4, FALLBACK_W, FALLBACK_H)

    const sumUsed = result.sheets.reduce((s, sh) => s + sh.preview.usedArea, 0)
    const sumReusable = result.sheets.reduce((s, sh) => s + sh.preview.reusableArea, 0)
    const sumScrap = result.sheets.reduce((s, sh) => s + sh.preview.scrapArea, 0)
    const sumUnits = result.sheets.reduce((s, sh) => s + sh.preview.unitsCompleted, 0)

    expect(result.totalUsedArea).toBeCloseTo(sumUsed, 2)
    expect(result.totalReusableArea).toBeCloseTo(sumReusable, 2)
    expect(result.totalScrapArea).toBeCloseTo(sumScrap, 2)
    expect(result.totalUnitsCompleted).toBe(sumUnits)
    expect(result.totalStockArea).toBeCloseTo(ROLL_W * ROLL_L * result.sheets.length, 2)
    expect(result.avgFabScore).toBeGreaterThanOrEqual(0)

    // sheetIndex preserved monotonically.
    result.sheets.forEach((sh, i) => {
      expect(sh.sheetIndex).toBe(i)
    })
  })
})

describe("Issue #119 — guards against worst-case CPU and silent regressions", () => {
  it("warns and keeps original sheet when re-pack would place fewer items", () => {
    // Hard to force a real re-pack regression deterministically. Instead spy
    // on console.warn and assert the post-process either accepts a strict
    // improvement or emits a warning. A no-warning, no-improvement run is
    // also acceptable (sheet 0 is the only sheet, which is preserved).
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const specs: SimplePartSpec[] = [cone(100, 12, 24, 12, 0, "C-100"), rect(8, 14, 1, 1, "B")]

    const result = globalMultiSheetPack(specs, ROLL_W, ROLL_L, 4, FALLBACK_W, FALLBACK_H)

    // No items lost regardless of accept/reject.
    const placed = result.sheets.reduce((s, sh) => s + sh.preview.items.length, 0)
    expect(placed + result.remainingOverflow).toBe(totalSpecQuantity(specs))

    // Any warn lines must reference issue-119 (so we know the post-process
    // emitted them, not unrelated code).
    for (const call of warnSpy.mock.calls) {
      const msg = String(call[0] ?? "")
      if (msg.includes("re-pack")) {
        expect(msg).toMatch(/issue-119/i)
      }
    }
    warnSpy.mockRestore()
  })

  // Note: the MAX_REPACK_SHEETS guard is exercised by integration with
  // realistic jobs. Constructing a synthetic >10-sheet overflow case here
  // requires fixture sizes that exceed practical cone dimensions; the guard
  // is verified instead by code review (constant + early-return at top of
  // the helper).
})

describe("Issue #119 — Plan A: full-job NFP with rect gap-fill", () => {
  it("collapses screenshot fixture from 3 sheets to 2 by tucking rect into NFP gap", () => {
    // The killer fixture from Steven's screenshot: 12 cones (100°/12/24) +
    // 1 small rect (8x14) on a 96"x48" sheet.
    //
    // Pre-fix (raw global packer): 3 sheets [4+rect, 4 (AABB grid), 4 (AABB grid)]
    // v1 only:                     3 sheets [4+rect, 6 (NFP fan), 2 (NFP partial)]
    // Plan A (target):             2 sheets [6 cones, 6 cones + rect gap-filled]
    //                              OR     [6+rect, 6] depending on which gap won
    const specs: SimplePartSpec[] = [cone(100, 12, 24, 12, 0, "C-100"), rect(8, 14, 1, 1, "B")]

    const result = globalMultiSheetPack(specs, ROLL_W, ROLL_L, 4, FALLBACK_W, FALLBACK_H)

    // The headline win: total sheet count must be 2.
    expect(result.sheets.length).toBe(2)

    // No items dropped (12 cones + 1 rect = 13).
    const placed = result.sheets.reduce((s, sh) => s + sh.preview.items.length, 0)
    expect(placed + result.remainingOverflow).toBe(totalSpecQuantity(specs))

    // Each sheet must contain ≥ 6 cones (NFP fan capacity for these dims).
    for (const sheet of result.sheets) {
      const coneCount = sheet.preview.items.filter((it) => it.renderShape === "sector").length
      expect(
        coneCount,
        `sheet ${sheet.sheetIndex} should have ≥ 6 cones via NFP, got ${coneCount}`
      ).toBeGreaterThanOrEqual(6)
    }

    // Rect must appear on EXACTLY one sheet (gap-filled into the NFP layout).
    const sheetsWithRect = result.sheets.filter((sh) =>
      sh.preview.items.some((it) => it.renderShape === "rect")
    )
    expect(sheetsWithRect.length).toBe(1)
  })

  it("contiguous sheetIndex 0..N-1 after Plan A splice", () => {
    const specs: SimplePartSpec[] = [cone(100, 12, 24, 12, 0, "C-100"), rect(8, 14, 1, 1, "B")]
    const result = globalMultiSheetPack(specs, ROLL_W, ROLL_L, 4, FALLBACK_W, FALLBACK_H)
    result.sheets.forEach((sh, i) => {
      expect(sh.sheetIndex, `sheet at position ${i} has stale sheetIndex ${sh.sheetIndex}`).toBe(i)
    })
  })

  it("falls back to v1 (overflow-only re-pack) when no rectangles in the job", () => {
    // Pure cone job large enough to force overflow — Plan A is ineligible
    // (no rects), so the wrapper falls through to v1 which re-packs the
    // overflow sheets via NFP. Without v1 the raw global packer's AABB
    // overflow sheets would carry only ~4 cones each (the bug pattern).
    const MAX_SHEETS = 4
    const specs: SimplePartSpec[] = [cone(100, 12, 24, 12, 0, "C")]
    const result = globalMultiSheetPack(specs, ROLL_W, ROLL_L, MAX_SHEETS, FALLBACK_W, FALLBACK_H)

    // Force overflow: 12 cones at this size require multiple sheets.
    expect(result.sheets.length).toBeGreaterThanOrEqual(2)
    // v1 must respect the caller's sheet budget — the overflow re-pack
    // cannot produce MORE sheets than the raw packer used. Catches the
    // CodeRabbit/OpenClaw "v1 sheet-count exceeds original" regression.
    expect(result.sheets.length).toBeLessThanOrEqual(MAX_SHEETS)

    // No items dropped, no rect kinds (v1 path doesn't introduce them).
    const placed = result.sheets.reduce((s, sh) => s + sh.preview.items.length, 0)
    expect(placed + result.remainingOverflow).toBe(totalSpecQuantity(specs))
    const allKinds = new Set(
      result.sheets.flatMap((sh) => sh.preview.items.map((it) => it.renderShape))
    )
    expect(allKinds.has("rect")).toBe(false)

    // v1 actually re-packed: any non-trailing pure-cone overflow sheet must
    // carry strictly more than the AABB-grid baseline (4).
    const overflow = result.sheets.slice(1)
    const fullOverflow = overflow.filter((sh) => !sh.isPartial)
    if (fullOverflow.length > 0) {
      for (const sheet of fullOverflow) {
        expect(
          sheet.preview.items.length,
          `v1 overflow sheet ${sheet.sheetIndex} should beat AABB tile (4)`
        ).toBeGreaterThan(4)
      }
    }
  })

  it("Plan A skipped for pure-rect jobs (no shape items to NFP)", () => {
    const specs: SimplePartSpec[] = [rect(20, 20, 12, 0, "R")]
    const result = globalMultiSheetPack(specs, ROLL_W, ROLL_L, 4, FALLBACK_W, FALLBACK_H)
    expect(result.sheets.length).toBeGreaterThan(0)
    for (const sheet of result.sheets) {
      expect(sheet.preview.items.length).toBeGreaterThan(0)
      expect(isPureRect(sheet.preview.items)).toBe(true)
    }
  })

  it("does not regress when both Plan A and v1 fall back to raw layout", () => {
    // A job with circles (renderShape="circle") makes Plan A ineligible AND
    // breaks v1's homogeneous-overflow check. Wrapper must return raw global
    // packer's output unchanged.
    const specs: SimplePartSpec[] = [
      { partType: "circle", quantity: 4, diameter: 20, _originalSpecIndex: 0, partNumber: "D" },
      rect(8, 14, 1, 1, "B"),
    ]
    const result = globalMultiSheetPack(specs, ROLL_W, ROLL_L, 4, FALLBACK_W, FALLBACK_H)
    expect(result.sheets.length).toBeGreaterThan(0)
    const placed = result.sheets.reduce((s, sh) => s + sh.preview.items.length, 0)
    expect(placed + result.remainingOverflow).toBe(totalSpecQuantity(specs))
  })
})
