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

  it("classifies regions just below the piece threshold as Strip when long", () => {
    // 6 × 24 strip threshold should catch tall narrow regions.
    expect(classifyOffcutType(region(0, 0, 6, 24))).toBe("Strip")
    expect(classifyOffcutType(region(0, 0, 24, 6))).toBe("Strip")
  })

  it("returns null for regions below both thresholds (true scrap)", () => {
    expect(classifyOffcutType(region(0, 0, 5, 5))).toBeNull()
    expect(classifyOffcutType(region(0, 0, 5, 23.9))).toBeNull()
    expect(classifyOffcutType(region(0, 0, 11.4, 11.9))).toBeNull()
  })

  it("prefers Piece over Strip when both thresholds are met", () => {
    // A 24 × 24 region qualifies under both — should report as the more
    // useful classification (Piece, the squarer/larger threshold).
    expect(classifyOffcutType(region(0, 0, 24, 24))).toBe("Piece")
  })
})

describe("buildOffcutSummary", () => {
  it("emits one row per individually-reusable offcut", () => {
    // CC-rideralong: a 12×12 piece next to a 5×5 sub-reusable rectangle.
    // The sub-rect should NOT generate a summary row even though it's in
    // `layout.offcuts` (the engine ships it because the CC contains a
    // reusable neighbor).
    const layout = emptyLayout([region(0, 0, 12, 12), region(12, 0, 5, 5)])
    const rows = buildOffcutSummary([layout])
    expect(rows).toHaveLength(1)
    expect(rows[0].number).toBe(1)
    expect(rows[0].region.width).toBe(12)
    expect(rows[0].type).toBe("Piece")
  })

  it("numbers globally across multiple rolls", () => {
    const rollA = emptyLayout([region(0, 0, 12, 12), region(20, 0, 6, 24)])
    const rollB = emptyLayout([region(5, 5, 24, 6)])
    const rows = buildOffcutSummary([rollA, rollB])
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3])
    expect(rows.map((r) => r.rollIndex)).toEqual([1, 1, 2])
    expect(rows.map((r) => r.rollTotal)).toEqual([2, 2, 2])
  })

  it("computes area in square feet from inch dimensions", () => {
    const layout = emptyLayout([region(0, 0, 12, 24)])
    const [row] = buildOffcutSummary([layout])
    // 12 × 24 = 288 sqin = 2.0 sqft
    expect(row.areaSqFt).toBeCloseTo(2.0, 5)
  })

  it("returns an empty list when no offcuts qualify", () => {
    const layout = emptyLayout([region(0, 0, 5, 5), region(10, 10, 4, 4)])
    expect(buildOffcutSummary([layout])).toEqual([])
  })

  it("preserves the original LayoutRegion reference so the PDF can read polygon data", () => {
    const r = region(3, 4, 12, 12)
    const layout = emptyLayout([r])
    const [row] = buildOffcutSummary([layout])
    expect(row.region).toBe(r)
  })

  it("classifies each row using the orientation-aware threshold", () => {
    const layout = emptyLayout([
      region(0, 0, 24, 6), // strip oriented horizontally
      region(0, 30, 6, 24), // strip oriented vertically
      region(0, 60, 12, 12), // piece
    ])
    const rows: OffcutSummaryRow[] = buildOffcutSummary([layout])
    expect(rows.map((r) => r.type)).toEqual(["Strip", "Strip", "Piece"])
  })
})
