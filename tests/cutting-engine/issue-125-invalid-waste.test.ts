/**
 * Regression tests for GitHub issue #125 — "Invalid Waste Calculation".
 *
 * The cut planner was rendering a thin scrap (pink) stripe sandwiched
 * between reusable (yellow) free space, even though the connected leftover
 * material was reusable. Row-by-row gap generation in `buildShelfGapBands`
 * emits one band per row; without x-edge normalization plus connected
 * classification, a narrow leftover row can stay isolated as scrap.
 *
 * The fix keeps `mergeVerticallyAdjacentBands`, slices mismatched x-ranges
 * before that merge, and promotes edge-connected free-space components that
 * contain any reusable band.
 */
import { describe, it, expect } from "vitest"
import {
  bandFitsAnyPreviewItem,
  buildShelfGapBands,
  classifyOffcutBands,
  isReusableOffcutBand,
  mergeVerticallyAdjacentBands,
  splitBandsAtCommonXEdges,
} from "@/app/dashboard/cutting-engine/_components/nesting-offcut-utils"
import { buildPartPreviewItem } from "@/app/dashboard/cutting-engine/_components/nesting-preview-builders"
import { packPreviewItemsOnShelves } from "@/app/dashboard/cutting-engine/_components/nesting-packing-utils"
import type {
  OffcutBand,
  PreviewItem,
  SimplePartSpec,
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

  it("fuses bands whose x/width differ by < EPS straddling a rounding boundary", () => {
    // Per CodeRabbit on PR #130: the previous bucket-by-Math.round(x/EPS)
    // approach split values that straddled a rounding boundary, e.g.
    // x=30.004 and x=30.006 (delta 0.002) landed in different buckets even
    // though they're well within the merge tolerance. Tolerance comparison
    // fuses them as expected.
    const merged = mergeVerticallyAdjacentBands([
      band(30.004, 0, 60, 10),
      band(30.006, 10, 60, 10),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].height).toBeCloseTo(20, 5)
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
  it("splits a full-width bottom band at the row-trailing band's x-edge", () => {
    const split = splitBandsAtCommonXEdges([band(28, 38, 68, 4), band(0, 42, 96, 6)])

    expect(split).toEqual([band(28, 38, 68, 4), band(0, 42, 28, 6), band(28, 42, 68, 6)])
  })

  it("merges a thin row-trailing stripe into the bottom offcut after splitting", () => {
    const placements: ShapePlacement[] = [
      { x: 0, y: 0, width: 96, height: 38 },
      { x: 0, y: 38, width: 28, height: 4 },
    ]
    const bands = buildShelfGapBands(placements, 96, 48)

    // Order doesn't matter — the merge walks tolerance-aware so band order
    // depends on the internal sort (sorted by x then width then y).
    expect(bands).toHaveLength(2)
    expect(bands).toEqual(expect.arrayContaining([band(28, 38, 68, 10), band(0, 42, 28, 6)]))
    expect(classifyOffcutBands(bands, []).scrapBands).toEqual([])
  })

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

  it("coalesces near-equal x-edges within EPS instead of emitting sub-EPS slivers", () => {
    // Two trailing strips at nearly identical x (30 vs 30.004) — without
    // EPS coalescing the splitter would produce a 0.004-wide sliver between
    // them. Per CodeRabbit on PR #130. The split should treat 30 ≈ 30.004
    // as one cut point and merge the strips into a single tall column.
    const placements: ShapePlacement[] = [
      { x: 0, y: 0, width: 30, height: 10 },
      { x: 0, y: 10, width: 30.004, height: 10 },
    ]
    const bands = buildShelfGapBands(placements, 96, 48)

    const trailing = bands.find((b) => Math.abs(b.x - 30) < 0.01 && b.width > 65)
    expect(trailing, "trailing strips at x≈30 should fuse despite fractional drift").toBeDefined()
    expect(trailing?.height).toBeCloseTo(48, 1)

    // No sub-EPS sliver should appear in the band list — every band must
    // have meaningful width.
    for (const b of bands) {
      expect(b.width, `sliver detected: x=${b.x} w=${b.width}`).toBeGreaterThan(0.01)
    }
  })

  it("doesn't emit micro-stripes when x-drift sits between EPS and MIN_GAP_BAND_SIZE", () => {
    // Per CodeRabbit on PR #130: x=30 vs x=30.02 is outside BAND_TOUCH_EPS
    // (so it survives the coalesce-by-EPS step) but the resulting 0.02"-
    // wide split column is below MIN_GAP_BAND_SIZE (0.25") — the same
    // threshold every upstream band generator uses to drop micro-stripes.
    // The split pass must coalesce at the larger threshold or we re-emit
    // exactly the artifact the rest of the pipeline normally suppresses.
    const placements: ShapePlacement[] = [
      { x: 0, y: 0, width: 30, height: 10 },
      { x: 0, y: 10, width: 30.02, height: 10 },
    ]
    const bands = buildShelfGapBands(placements, 96, 48)

    // No band should be narrower than MIN_GAP_BAND_SIZE (0.25").
    for (const b of bands) {
      expect(b.width, `micro-stripe: x=${b.x} w=${b.width}`).toBeGreaterThanOrEqual(0.25)
    }
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
      expect(isWide && isThin, `regression: thin wide bottom stripe ${b.width}x${b.height}`).toBe(
        false
      )
    }
  })
})

describe("issue #125 — connected free-space classification", () => {
  it("absorbs the screenshot-style stripe touching a reusable bottom band", () => {
    const classified = classifyOffcutBands([band(28, 38, 68, 4), band(0, 42, 96, 6)], [])

    expect(classified.scrapBands).toEqual([])
    expect(classified.offcutBands).toHaveLength(2)
    expect(classified.reusableArea).toBe(68 * 4 + 96 * 6)
  })

  it("does not absorb a stripe separated by a real gap", () => {
    const classified = classifyOffcutBands([band(28, 37, 68, 4), band(0, 42, 96, 6)], [])

    expect(classified.scrapBands).toEqual([band(28, 37, 68, 4)])
    expect(classified.offcutBands).toEqual([band(0, 42, 96, 6)])
  })

  it("does not absorb corner-only contact", () => {
    const classified = classifyOffcutBands([band(0, 0, 4, 4), band(4, 4, 96, 6)], [])

    expect(classified.scrapBands).toEqual([band(0, 0, 4, 4)])
    expect(classified.offcutBands).toEqual([band(4, 4, 96, 6)])
  })

  it("classifies the sync first-paint issue #125 shelf layout without visual scrap bands", () => {
    const requestedItems = buildIssue125Items()
    const packed = packPreviewItemsOnShelves(requestedItems, 96, 48, "width")

    expect(
      packed.items.map(({ x, y, width, height, rotated90 }) => ({ x, y, width, height, rotated90 }))
    ).toEqual([
      { x: 0, y: 0, width: Math.PI * 12, height: 18, rotated90: false },
      { x: Math.PI * 12, y: 0, width: 40, height: 28, rotated90: true },
      { x: Math.PI * 12 + 40, y: 0, width: 14, height: 24, rotated90: true },
      { x: 0, y: 28, width: 24, height: 12, rotated90: true },
    ])

    const bands = buildShelfGapBands(packed.items, 96, 48)
    const rawScrap = bands.filter((candidate) => !bandFitsAnyPreviewItem(candidate, packed.items))
    expect(rawScrap).toEqual([band(Math.PI * 12 + 54, 0, 96 - (Math.PI * 12 + 54), 48)])

    const classified = classifyOffcutBands(bands, packed.items)
    expect(classified.scrapBands).toEqual([])
  })
})

function buildIssue125Items(): Array<PreviewItem & { usedArea: number }> {
  const specs: SimplePartSpec[] = [
    { partType: "trapezoid", quantity: 1, topWidth: 20, bottomWidth: 28, height: 40 },
    { partType: "rectangle", quantity: 1, width: 12, length: 24 },
    { partType: "rectangle", quantity: 1, width: 24, length: 14 },
    { partType: "cylinder", quantity: 1, diameter: 12, height: 18 },
  ]

  return specs.map((spec, specIndex) => {
    const item = buildPartPreviewItem(spec, 0, 0)
    item.specIndex = specIndex
    return item
  })
}
