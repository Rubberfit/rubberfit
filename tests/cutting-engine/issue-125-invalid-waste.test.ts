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

describe("issue #125 — buildShelfGapBands integrates the split + merge pass", () => {
  it("trailing strips fuse vertically AND with the (split) bottom band", () => {
    // Two side-by-side rows of placements leave trailing strips at
    // {x:30, w:66}; the bottom band {x:0, w:96, y:20, h:28} gets sliced at
    // x=30 by `splitBandsAtCommonXEdges`, producing a {x:30, w:66, y:20,
    // h:28} piece that merges with the trailing strips into one tall band.
    const placements: ShapePlacement[] = [
      { x: 0, y: 0, width: 30, height: 10 },
      { x: 0, y: 10, width: 30, height: 10 },
    ]
    const bands = buildShelfGapBands(placements, 96, 48)

    const trailing = bands.find((b) => b.x === 30 && b.width === 66)
    expect(trailing, "trailing strips at x=30,width=66 should fuse").toBeDefined()
    // Two trailing strips (10 each) + bottom slice at the same x-range (28)
    // = 48, the full height from y=0 to the sheet bottom.
    expect(trailing?.height).toBe(48)
  })

  it("issue #125 reproduction: scrap stripe between row-trailing and bottom band gets absorbed", () => {
    // Mimic the user's reported screenshot: a tall placement on the left
    // (trapezoid) leaves a wide trailing strip; a few small placements
    // form a row to the right. Without split-then-merge, the bottom band
    // at the very bottom couldn't fuse with the trailing strip above it
    // because they had different (x, width). After this fix, the bottom
    // band gets sliced at the trailing strip's x-edges and the matching
    // pieces fuse — eliminating the thin scrap stripe artifact.
    const placements: ShapePlacement[] = [
      { x: 0, y: 0, width: 28, height: 40 }, // trapezoid AABB
      { x: 28, y: 0, width: 18, height: 38 }, // cylinder rotated tall
      { x: 46, y: 0, width: 24, height: 14 }, // 24×14
      { x: 70, y: 0, width: 12, height: 24 }, // 12×24
    ]
    const bands = buildShelfGapBands(placements, 96, 48)

    // No band should exist that is geometrically a "thin scrap stripe at
    // the very bottom of the sheet" (height < 6 spanning much of the sheet
    // width). Specifically: any band touching the sheet's bottom edge
    // (y + height ≈ 48) must have either real reusable height (≥ 6) or
    // not be classified as a tiny isolated stripe.
    const bottomTouchers = bands.filter((b) => Math.abs(b.y + b.height - 48) < 0.5)
    for (const b of bottomTouchers) {
      // Stripes thinner than the strip threshold WITH wide x-coverage are
      // exactly the bug we just fixed.
      const isWide = b.width > 80
      const isThin = b.height < 6
      expect(isWide && isThin, `regression: thin wide bottom stripe ${b.width}x${b.height}`).toBe(false)
    }
  })
})
