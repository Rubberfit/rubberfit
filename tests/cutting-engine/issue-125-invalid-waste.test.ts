/**
 * Regression tests for GitHub issue #125 — "Invalid Waste Calculation".
 *
 * The cut planner was rendering a thin scrap (pink) stripe sandwiched
 * between two reusable (yellow) bands that shared the same x-range, even
 * though the combined rectangle was clearly reusable. Row-by-row gap
 * generation in `buildShelfGapBands` emits one band per row; without a
 * post-pass to fuse vertically-adjacent (x, width)-matching bands, a
 * narrow leftover row stays classified independently as scrap.
 *
 * The fix restores `mergeVerticallyAdjacentBands` (originally PR #106,
 * deleted by PR #112's rust migration). After merging, the combined band
 * re-hits `isReusableOffcutBand` and the visual scrap-stripe disappears.
 */
import { describe, it, expect } from "vitest"
import {
  buildShelfGapBands,
  isReusableOffcutBand,
  mergeVerticallyAdjacentBands,
} from "@/app/dashboard/cutting-engine/_components/nesting-offcut-utils"
import type {
  OffcutBand,
  ShapePlacement,
} from "@/app/dashboard/cutting-engine/_components/nesting-visualizer-types"

function band(x: number, y: number, width: number, height: number): OffcutBand {
  return { x, y, width, height }
}

describe("issue #125 — mergeVerticallyAdjacentBands (restored from PR #106)", () => {
  it("fuses two (x, width)-aligned vertically-touching bands into one", () => {
    const merged = mergeVerticallyAdjacentBands([band(0, 40, 96, 4), band(0, 44, 96, 4)])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual({ x: 0, y: 40, width: 96, height: 8 })
  })

  it("fuses three+ touching bands in the same column", () => {
    const merged = mergeVerticallyAdjacentBands([
      band(0, 0, 96, 4),
      band(0, 4, 96, 4),
      band(0, 8, 96, 4),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual({ x: 0, y: 0, width: 96, height: 12 })
  })

  it("does NOT fuse bands that don't share x/width", () => {
    const merged = mergeVerticallyAdjacentBands([band(0, 40, 96, 4), band(10, 44, 80, 4)])
    expect(merged).toHaveLength(2)
  })

  it("does NOT fuse non-touching bands within the same (x, width) bucket", () => {
    const merged = mergeVerticallyAdjacentBands([band(0, 0, 96, 4), band(0, 20, 96, 4)])
    expect(merged).toHaveLength(2)
  })

  it("is a no-op for empty / single-band input", () => {
    expect(mergeVerticallyAdjacentBands([])).toEqual([])
    expect(mergeVerticallyAdjacentBands([band(0, 0, 96, 8)])).toEqual([band(0, 0, 96, 8)])
  })

  it("preserves polygon and other band fields when fusing", () => {
    const a: OffcutBand = { x: 0, y: 40, width: 96, height: 4 }
    const b: OffcutBand = { x: 0, y: 44, width: 96, height: 4 }
    const merged = mergeVerticallyAdjacentBands([a, b])
    expect(merged).toHaveLength(1)
    expect(merged[0].x).toBe(0)
    expect(merged[0].width).toBe(96)
    expect(merged[0].height).toBe(8)
  })
})

describe("issue #125 — re-classification after merging promotes scrap to reusable", () => {
  it("a 96×4 strip is too thin to be reusable on its own", () => {
    expect(isReusableOffcutBand(band(0, 40, 96, 4))).toBe(false)
  })

  it("but a 96×8 merged band hits the reusable strip threshold", () => {
    expect(isReusableOffcutBand(band(0, 40, 96, 8))).toBe(true)
  })

  it("merging two 96×4 bands then classifying yields reusable", () => {
    const merged = mergeVerticallyAdjacentBands([band(0, 40, 96, 4), band(0, 44, 96, 4)])
    expect(merged).toHaveLength(1)
    expect(isReusableOffcutBand(merged[0])).toBe(true)
  })
})

describe("issue #125 — buildShelfGapBands integrates the merge pass", () => {
  it("for a layout that produces row-aligned strips, post-build bands are merged", () => {
    // Two side-by-side rows of placements that leave a trailing strip in
    // the same x-range. Without the merge pass, two separate trailing
    // strips would survive; with the merge they combine into one.
    const placements: ShapePlacement[] = [
      { x: 0, y: 0, width: 30, height: 10 },
      { x: 0, y: 10, width: 30, height: 10 },
    ]
    const bands = buildShelfGapBands(placements, 96, 48)

    // The trailing strips at (30, 0, 66, 10) and (30, 10, 66, 10) plus the
    // bottom band (0, 20, 96, 28) all carry MIN_GAP_BAND_SIZE > 0.25
    // checks. After merge, the two trailing strips become (30, 0, 66, 20).
    const trailing = bands.find((b) => b.x === 30 && b.width === 66)
    expect(trailing, "trailing strips at x=30,width=66 should fuse").toBeDefined()
    expect(trailing?.height).toBe(20)
  })
})
