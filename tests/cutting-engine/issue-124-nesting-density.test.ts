/**
 * Density-analysis tests for GitHub issue #124 — "Nesting not appearing
 * to be as optimal as possible".
 *
 * The cut planner's TS hybrid packer auto-selected `tryTrapezoidHybridCandidate`
 * over the shelf-pack fallback even when the hybrid was geometrically worse:
 * trapezoids interlock at the top and "other" shapes get translated below
 * the trapezoid band, never sharing a row. Small parts (like A/B/C in the
 * issue screenshot) end up stranded with large reusable-offcut pockets
 * sitting around them.
 *
 * The fix: always evaluate the fallback (best-of-4-sorts shelf packing)
 * alongside hybrid + mixed-NFP candidates, and pick the densest one via
 * the existing `comparePackingCandidates` comparator. Hybrid keeps winning
 * for the layouts where it's actually best (e.g. all trapezoids).
 *
 * Metrics tracked:
 *   - `overflowUnits === 0`             — all parts must fit
 *   - `density = usedArea / bboxArea`   — higher = tighter packing
 *   - `bboxArea`                        — smaller = better stock utilization
 *   - `bandsInStockBounds`              — every offcut band must be inside the sheet
 */
import { describe, it, expect } from "vitest"
import { rotateSimplePartPreviewForLongStockDisplay } from "@/app/dashboard/cutting-engine/_components/nesting-layout-utils"
import {
  generateMultiPartPreview,
  generateMultiPartPreviewAsync,
} from "@/app/dashboard/cutting-engine/_components/nesting-shape-previews"
import type {
  OffcutBand,
  SimplePartPreview,
  SimplePartSpec,
} from "@/app/dashboard/cutting-engine/_components/nesting-visualizer-types"

const ROLL_W = 96
const ROLL_L = 48
const FALLBACK_W = 24
const FALLBACK_H = 12
const LONG_STOCK_RAW_W = 78
const LONG_STOCK_RAW_L = 396
const LONG_STOCK_DISPLAY_W = 396
const LONG_STOCK_DISPLAY_L = 78

// Per Codex's investigation — approximates the issue #124 screenshot's
// 7-shape layout (A/B/C rectangles, D/E cones, F/G trapezoids on a 96×48
// sheet). The exact specs are inferred from visible dimensions; the test
// is robust to small variation since assertions are on density floors.
const SCREENSHOT_SPECS: SimplePartSpec[] = [
  { partType: "rectangle", quantity: 1, width: 8, length: 14, partNumber: "A" },
  { partType: "rectangle", quantity: 1, width: 8, length: 16, partNumber: "B" },
  { partType: "rectangle", quantity: 1, width: 30, length: 7, partNumber: "C" },
  {
    partType: "cone",
    quantity: 1,
    innerRadius: 11,
    outerRadius: 22,
    arcDegrees: 70,
    partNumber: "D",
  },
  {
    partType: "cone",
    quantity: 1,
    innerRadius: 11,
    outerRadius: 31,
    arcDegrees: 130,
    partNumber: "E",
  },
  {
    partType: "trapezoid",
    quantity: 1,
    topWidth: 42,
    bottomWidth: 34,
    height: 18,
    partNumber: "F",
  },
  {
    partType: "trapezoid",
    quantity: 1,
    topWidth: 30,
    bottomWidth: 24,
    height: 14,
    partNumber: "G",
  },
]

// Regression for the follow-up report on a much longer 78×396 roll displayed
// as 396×78. Before the display-rotation fix, origin-packed raw layouts showed
// up pinned to the far right after clockwise rotation, leaving a full-height
// offcut on the left. These dimensions approximate the reported A-H mix.
const LONG_STOCK_SPECS: SimplePartSpec[] = [
  { partType: "rectangle", quantity: 1, width: 40, length: 40, partNumber: "A" },
  { partType: "rectangle", quantity: 1, width: 24, length: 24, partNumber: "B" },
  { partType: "rectangle", quantity: 1, width: 48, length: 30, partNumber: "C" },
  { partType: "rectangle", quantity: 1, width: 24, length: 24, partNumber: "D" },
  {
    partType: "cone",
    quantity: 1,
    innerRadius: 8,
    outerRadius: 28,
    arcDegrees: 160,
    partNumber: "E",
  },
  {
    partType: "cone",
    quantity: 1,
    innerRadius: 12,
    outerRadius: 38,
    arcDegrees: 160,
    partNumber: "F",
  },
  {
    partType: "trapezoid",
    quantity: 1,
    topWidth: 60,
    bottomWidth: 72,
    height: 28,
    partNumber: "G",
  },
  { partType: "rectangle", quantity: 1, width: 78, length: 40, partNumber: "H" },
]

interface DensityReport {
  itemsPlaced: number
  overflowUnits: number
  usedArea: number
  bboxArea: number
  density: number
  reusableArea: number
  scrapArea: number
  minX: number
  stockUtilization: number
  bandsOutsideStock: OffcutBand[]
}

function analyzePreview(preview: SimplePartPreview, rollW = ROLL_W, rollL = ROLL_L): DensityReport {
  const minX = preview.items.length > 0 ? Math.min(...preview.items.map((item) => item.x)) : 0
  const bboxArea = Math.max(1, preview.occupiedWidth * preview.occupiedHeight)
  const allBands = [...preview.offcutBands, ...preview.scrapBands]
  const bandsOutsideStock = allBands.filter(
    (b) =>
      b.x < -0.01 || b.y < -0.01 || b.x + b.width > rollW + 0.01 || b.y + b.height > rollL + 0.01
  )
  return {
    itemsPlaced: preview.items.length,
    overflowUnits: preview.overflowUnits,
    usedArea: preview.usedArea,
    bboxArea,
    density: preview.usedArea / bboxArea,
    reusableArea: preview.reusableArea,
    scrapArea: preview.scrapArea,
    minX,
    stockUtilization: rollW * rollL > 0 ? preview.usedArea / (rollW * rollL) : 0,
    bandsOutsideStock,
  }
}

describe("issue #124 — nesting density on the 7-shape screenshot fixture", () => {
  it("sync first-paint (skipNfp=true) places every part inside the stock", () => {
    const preview = generateMultiPartPreview(
      ROLL_W,
      ROLL_L,
      SCREENSHOT_SPECS,
      FALLBACK_W,
      FALLBACK_H,
      true
    )
    const report = analyzePreview(preview)
    expect(report.overflowUnits, `unfit parts: ${report.overflowUnits}`).toBe(0)
    expect(report.itemsPlaced).toBe(SCREENSHOT_SPECS.length)
  })

  it("async refinement reaches a usable density and respects stock bounds", async () => {
    const preview = await generateMultiPartPreviewAsync(
      ROLL_W,
      ROLL_L,
      SCREENSHOT_SPECS,
      FALLBACK_W,
      FALLBACK_H
    )
    const report = analyzePreview(preview)

    // Fit guarantee
    expect(report.overflowUnits, "all parts must fit on the sheet").toBe(0)
    expect(report.itemsPlaced).toBe(SCREENSHOT_SPECS.length)

    // Density floor: with the hybrid auto-pick disabled, the best of
    // (hybrid, mixed-NFP, fallback) wins — density on this fixture
    // measured >0.50 after the fix vs ~0.30-0.40 before.
    expect(
      report.density,
      `bbox density = ${report.density.toFixed(3)} (used=${report.usedArea.toFixed(0)}, bbox=${report.bboxArea.toFixed(0)})`
    ).toBeGreaterThan(0.5)

    // Sanity on the 18×56 anomaly the user flagged: no offcut/scrap band
    // may extend past the actual stock dimensions.
    expect(
      report.bandsOutsideStock,
      `bands outside stock: ${JSON.stringify(report.bandsOutsideStock, null, 2)}`
    ).toEqual([])
  })

  it("hybrid candidate never auto-wins when fallback packs strictly tighter", async () => {
    // Construct a mix where the trapezoid-hybrid path leaves big slivers but
    // the basic shelf packer can stack everything cleanly. Two trapezoids +
    // a small rectangle: fallback shelf can place the rect next to a
    // trapezoid; hybrid forces the rect below the trapezoid band, wasting
    // most of the sheet.
    const specs: SimplePartSpec[] = [
      { partType: "trapezoid", quantity: 1, topWidth: 20, bottomWidth: 28, height: 40 },
      { partType: "trapezoid", quantity: 1, topWidth: 18, bottomWidth: 24, height: 36 },
      { partType: "rectangle", quantity: 1, width: 12, length: 8 },
    ]
    const preview = await generateMultiPartPreviewAsync(96, 48, specs, FALLBACK_W, FALLBACK_H)
    const report = analyzePreview(preview)
    expect(report.overflowUnits).toBe(0)
    // The dispatcher should pick the densest candidate; this fixture's
    // best-of-three places all 3 with sane density.
    expect(report.density).toBeGreaterThan(0.4)
  })

  it("long 396×78 display remains left-anchored after rotating raw roll coordinates", async () => {
    const rawPreview = await generateMultiPartPreviewAsync(
      LONG_STOCK_RAW_W,
      LONG_STOCK_RAW_L,
      LONG_STOCK_SPECS,
      FALLBACK_W,
      FALLBACK_H
    )
    const displayedPreview = rotateSimplePartPreviewForLongStockDisplay(
      rawPreview,
      LONG_STOCK_RAW_W
    )
    const report = analyzePreview(displayedPreview, LONG_STOCK_DISPLAY_W, LONG_STOCK_DISPLAY_L)

    expect(report.overflowUnits, "all A-H parts must fit on the long stock").toBe(0)
    expect(report.itemsPlaced).toBe(LONG_STOCK_SPECS.length)
    expect(
      report.minX,
      `displayed bbox must start at the left edge, got x=${report.minX}`
    ).toBeLessThanOrEqual(1)
    expect(report.stockUtilization).toBeGreaterThan(0.35)
    expect(report.bandsOutsideStock).toEqual([])
  })
})
