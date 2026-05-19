/**
 * Phase 5 PR 6 — unit tests for the screen-reader sheet summary.
 * Pins the copy format and edge cases so a future tweak doesn't
 * silently change what NVDA / VoiceOver announce when focus enters
 * the detail SVG region.
 */
import { describe, expect, it } from "vitest"
import { buildSheetSummary } from "@/app/dashboard/cutting-engine/_components/sheet-summary"
import type { SheetPreview } from "@/app/dashboard/cutting-engine/_components/nesting-visualizer-types"

function makeSheet(opts: {
  sheetIndex?: number
  isPartial?: boolean
  piecesShown?: number
  scrapArea?: number
  reusableArea?: number
}): SheetPreview {
  return {
    sheetIndex: opts.sheetIndex ?? 0,
    isPartial: opts.isPartial ?? false,
    preview: {
      renderShape: "rect",
      strategyName: "",
      strategyNote: "",
      placementMode: "origin",
      wasteMode: "bands",
      cutPlanTitle: "",
      cutSteps: [],
      requestedUnits: 0,
      unitsCompleted: 0,
      overflowUnits: 0,
      piecesShown: opts.piecesShown ?? 0,
      piecesPerUnit: 0,
      usedArea: 0,
      wasteArea: 0,
      wastePct: 0,
      reusableArea: opts.reusableArea ?? 0,
      scrapArea: opts.scrapArea ?? 0,
      occupiedWidth: 0,
      occupiedHeight: 0,
      items: [],
      offcutBands: [],
      scrapBands: [],
      placements: [],
      label: "",
    },
  }
}

describe("buildSheetSummary", () => {
  it("renders the canonical multi-sheet sentence", () => {
    const summary = buildSheetSummary(
      makeSheet({
        sheetIndex: 2,
        piecesShown: 6,
        scrapArea: 144 * 2, // 2 sqft scrap
        reusableArea: 144 * 3, // 3 sqft reusable
      }),
      8,
      144 * 16 // 16 sqft total stock
    )
    expect(summary).toBe(
      "Sheet 3 of 8: 6 parts placed, 13 percent scrap, 19 percent reusable offcut"
    )
  })

  it("omits the sheet count when only one sheet (single-sheet pack)", () => {
    const summary = buildSheetSummary(makeSheet({ sheetIndex: 0, piecesShown: 4 }), 1, 144 * 10)
    expect(summary).toMatch(/^Sheet: /)
    expect(summary).not.toMatch(/Sheet 1 of/)
  })

  it("appends ', partial sheet' when the sheet didn't fit everything", () => {
    const summary = buildSheetSummary(
      makeSheet({ sheetIndex: 0, isPartial: true, piecesShown: 2 }),
      2,
      144 * 8
    )
    expect(summary).toMatch(/partial sheet$/)
  })

  it("singularises 'part' when only one is placed", () => {
    const summary = buildSheetSummary(makeSheet({ piecesShown: 1 }), 1, 144 * 4)
    expect(summary).toMatch(/1 part placed/)
    expect(summary).not.toMatch(/1 parts/)
  })

  it("guards against zero total stock area (NaN/Infinity-safe)", () => {
    const summary = buildSheetSummary(makeSheet({ piecesShown: 3 }), 1, 0)
    expect(summary).toMatch(/0 percent scrap/)
    expect(summary).toMatch(/0 percent reusable/)
  })
})
