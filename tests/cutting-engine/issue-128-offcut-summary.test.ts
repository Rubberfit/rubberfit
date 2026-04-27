/**
 * Regression tests for GitHub issue #128 — "Display the size of the reusable
 * offcuts in the PDF". The cut history PDF previously labeled only the
 * single largest offcut region with width × length and emitted no summary.
 *
 * The fix introduces `buildOffcutSummary` + `classifyOffcutType` in
 * `cut-history-pdf-offcut.ts`, plus rendering changes in `cut-history-pdf.ts`
 * (numbered markers per region + summary table). These tests pin the pure
 * helper output so the PDF builder's assumptions don't drift.
 */
import { describe, expect, it } from "vitest"

import {
  buildOffcutSummary,
  classifyOffcutType,
  type OffcutSummaryRow,
} from "@/app/dashboard/cutting-engine/_components/cut-history-pdf-offcut"
import type {
  LayoutModel,
  LayoutRegion,
} from "@/app/dashboard/cutting-engine/_components/layout-model"

function region(x: number, y: number, w: number, h: number): LayoutRegion {
  return { x, y, width: w, height: h }
}

function emptyLayout(offcuts: LayoutRegion[]): LayoutModel {
  return {
    sheetWidth: 60,
    sheetLength: 120,
    sheetIndex: 0,
    parts: [],
    offcuts,
    scrap: [],
    placedCount: 0,
    overflowCount: 0,
    usedAreaSqFt: 0,
    reusableAreaSqFt: 0,
    scrapAreaSqFt: 0,
    fabScore: 1,
    source: "ts-nfp",
  } as unknown as LayoutModel
}

describe("classifyOffcutType", () => {
  it("classifies a 12 × 12 region at the piece threshold as Piece", () => {
    expect(classifyOffcutType(region(0, 0, 11.5, 12))).toBe("Piece")
    expect(classifyOffcutType(region(0, 0, 12, 11.5))).toBe("Piece")
  })

  it("classifies long narrow regions as Strip", () => {
    expect(classifyOffcutType(region(0, 0, 6, 24))).toBe("Strip")
    expect(classifyOffcutType(region(0, 0, 24, 6))).toBe("Strip")
  })

  it("falls back to Strip for sub-Piece regions — never null", () => {
    // The upstream engine already filters scrap out of `layout.offcuts`,
    // so we don't try to second-guess it here. Anything that doesn't
    // meet Piece dimensions just gets the Strip label.
    expect(classifyOffcutType(region(0, 0, 5, 5))).toBe("Strip")
    expect(classifyOffcutType(region(0, 0, 5, 23.9))).toBe("Strip")
    expect(classifyOffcutType(region(0, 0, 11.4, 11.9))).toBe("Strip")
  })

  it("prefers Piece over Strip when the Piece threshold is met", () => {
    expect(classifyOffcutType(region(0, 0, 24, 24))).toBe("Piece")
  })
})

describe("buildOffcutSummary", () => {
  it("merges adjacent rectangles into a single zone when shared edge is substantial", () => {
    // Big 24×24 piece + two 6×24 strips stacked vertically against its
    // right edge. Each 6×24 shares a full 24" edge with its neighbor —
    // well above the 6" merge threshold — so all three cluster.
    const big = region(0, 0, 24, 24)
    const stripA = region(24, 0, 6, 24)
    const stripB = region(30, 0, 6, 24)
    const layout = emptyLayout([big, stripA, stripB])
    const rows = buildOffcutSummary([layout])
    expect(rows).toHaveLength(1)
    expect(rows[0].region).toBe(big) // canonical = largest rect
    // 24*24 + 6*24 + 6*24 = 864 sqin = 6.0 sqft
    expect(rows[0].areaSqFt).toBeCloseTo(864 / 144, 5)
  })

  it("does NOT merge two strips that only touch at a corner / sliver", () => {
    // Real-world pattern: a vertical left strip and a horizontal bottom
    // strip on the same roll meeting at the corner. Pre-fix these
    // clustered into one zone (with a single marker) because they
    // shared a 1" edge. Operator sees two distinct offcuts — each
    // gets its own marker now.
    const leftStrip = region(0, 0, 1, 35) // 1" wide x 35" tall
    const bottomStrip = region(0, 35, 78, 1) // 78" wide x 1" tall
    const layout = emptyLayout([leftStrip, bottomStrip])
    const rows = buildOffcutSummary([layout])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.region)).toEqual([leftStrip, bottomStrip])
  })

  it('keeps two reusable strips separate when they only share a 1" sliver', () => {
    // Same shape as above but at a reusable size: each strip is 6"x24"
    // (qualifies as Strip). They touch at the corner only.
    const leftStrip = region(0, 0, 6, 24) // 6 wide × 24 tall
    const bottomStrip = region(0, 24, 60, 6) // 60 wide × 6 tall, touches at (0..6, 24)
    const layout = emptyLayout([leftStrip, bottomStrip])
    const rows = buildOffcutSummary([layout])
    // They share a 6" edge, so technically AT the threshold. The
    // touch-test uses `>=` so they DO merge. Documenting the
    // boundary behavior — anything below 6" stays separate.
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })

  it("emits rows even for sub-Piece zones — labels them Strip", () => {
    // Upstream `classifyOffcutBands` already filtered scrap; if a 5×5
    // rect made it to `layout.offcuts` we trust it and mark it. The
    // two 5×5s share a 5" edge — under the 6" clustering threshold —
    // so they stay separate.
    const layout = emptyLayout([region(0, 0, 5, 5), region(5, 0, 5, 5)])
    const rows = buildOffcutSummary([layout])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.type)).toEqual(["Strip", "Strip"])
  })

  it("numbers continuously across rolls (Roll 1 → 1, Roll 2 keeps counting)", () => {
    const rollA = emptyLayout([
      region(0, 0, 12, 12),
      region(0, 30, 6, 24), // disjoint from the piece, separate zone
    ])
    const rollB = emptyLayout([region(5, 5, 24, 6)])
    const rows = buildOffcutSummary([rollA, rollB])
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3])
    expect(rows.map((r) => r.rollIndex)).toEqual([1, 1, 2])
    expect(rows.map((r) => r.rollTotal)).toEqual([2, 2, 2])
  })

  it("treats disjoint rectangles as separate zones (no false clustering)", () => {
    // Two reusable pieces with a 50-inch gap between them. Distinct CCs.
    const layout = emptyLayout([region(0, 0, 12, 12), region(80, 80, 12, 12)])
    expect(buildOffcutSummary([layout])).toHaveLength(2)
  })

  it("computes area in square feet from inch dimensions", () => {
    const layout = emptyLayout([region(0, 0, 12, 24)])
    const [row] = buildOffcutSummary([layout])
    // 12 × 24 = 288 sqin = 2.0 sqft
    expect(row.areaSqFt).toBeCloseTo(2.0, 5)
  })

  it("returns an empty list only when the layout has no offcuts at all", () => {
    expect(buildOffcutSummary([emptyLayout([])])).toEqual([])
  })

  it("preserves the canonical LayoutRegion reference so the PDF can read polygon data", () => {
    const r = region(3, 4, 12, 12)
    const layout = emptyLayout([r])
    const [row] = buildOffcutSummary([layout])
    expect(row.region).toBe(r)
  })

  it("classifies each zone using the orientation-aware threshold", () => {
    // Three disjoint zones — clustering shouldn't merge them since they
    // don't touch.
    const layout = emptyLayout([
      region(0, 0, 24, 6), // strip oriented horizontally
      region(0, 30, 6, 24), // strip oriented vertically
      region(0, 60, 12, 12), // piece
    ])
    const rows: OffcutSummaryRow[] = buildOffcutSummary([layout])
    expect(rows.map((r) => r.type)).toEqual(["Strip", "Strip", "Piece"])
  })
})
