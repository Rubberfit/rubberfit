/**
 * Regression tests for GitHub issue #116 — "Unclear waste region calculation".
 *
 * Free-roam mode produced phantom red strips next to placed parts that
 * didn't correspond to any real geometric trap (e.g. a thin sliver above
 * a rectangle that has plenty of unused stock above it). The strips also
 * appeared to "move around" when unrelated shapes were added elsewhere
 * on the canvas — a circle at the bottom would shift the strip from
 * above one rect to its left.
 *
 * Root cause: `extractMaximalFreeRects` greedily decomposes the free
 * polygon and emits *any* axis-aligned rectangle below the usable
 * threshold as scrap. The greedy carve order is topology-dependent, so
 * adding a shape elsewhere shuffles which rects come out and where they
 * appear.
 *
 * Fix: replace the greedy thin-strip extractor with two deterministic
 * topological signals:
 *
 *   1. SHAPE-ENVELOPE waste — local-coords `envelope − shape` per
 *      placement (rotated/translated to sheet space). Discs produce
 *      corner crescents, trapezoids tapered slivers, rectangles
 *      nothing. Invariant under arrangement.
 *   2. TRAPPED-POCKET waste — connected components of `stock − ⋃parts`
 *      that don't touch the stock boundary. A 12×12 hole fully enclosed
 *      by four parts is a real pocket; an open strip touching the stock
 *      edge is "open frontier", not waste.
 *
 * Together these match the operator's mental model: red marks material
 * I can't recover by sliding things around.
 */
import { describe, expect, it } from "vitest"
import { computeAdaptiveRegions } from "@/app/dashboard/cutting-engine/_components/free-roam-regions"
import type { ManualPlacement } from "@/app/dashboard/cutting-engine/_components/free-roam-collision"
import type { PartTemplate } from "@/app/dashboard/cutting-engine/_components/preset-template-data"
import type { StockConfig } from "@/app/dashboard/cutting-engine/_components/stock-preview-configurator"

function rectTemplate(id: string, width: number, length: number): PartTemplate {
  return {
    id,
    partType: "rectangle",
    label: id,
    summary: `${width}" × ${length}"`,
    quantity: 1,
    category: "standard",
    width,
    length,
  }
}

function discTemplate(id: string, diameter: number): PartTemplate {
  return {
    id,
    partType: "cylinder",
    label: id,
    summary: `Ø${diameter}"`,
    quantity: 1,
    category: "standard",
    diameter,
  }
}

function place(id: string, templateId: string, x: number, y: number): ManualPlacement {
  return { id, templateId, x, y, rotationRad: 0 }
}

const STOCK: StockConfig = {
  width: 96,
  length: 48,
  thickness: 0.06,
  material: "EPDM",
  kerf: 0.125,
}

describe("issue #116 — free-roam waste classification", () => {
  it("A. open-edge sliver above a single rect is NOT classified as scrap", () => {
    // Single 24×12 rect placed in the middle of a 96×48 sheet. There's
    // plenty of open space above (~18"), to the left (~30"), and below
    // (~18"). None of that is "trapped" — operators can plan around it
    // freely. Pre-fix this emitted phantom strips along the rect edges.
    const parts = [rectTemplate("rect-A", 24, 12)]
    const placements = [place("p1", "rect-A", 36, 18)]

    const { offcuts, scrap } = computeAdaptiveRegions(placements, parts, STOCK)

    expect(offcuts).toEqual([])
    expect(scrap).toEqual([])
  })

  it("B. narrow gap between two parallel rects IS classified as scrap (per-side gap)", () => {
    // Two 24×12 rects stacked vertically with a 3" gap between them
    // (rect-A bottom at y=22, next top at y=25). The gap is below
    // MIN_USABLE_GAP_IN (4") so it counts as waste.
    const parts = [rectTemplate("rect-A", 24, 12)]
    const placements = [place("p1", "rect-A", 10, 10), place("p2", "rect-A", 10, 25)]

    const { scrap } = computeAdaptiveRegions(placements, parts, STOCK)

    const gapStrip = scrap.find((r) => r.y >= 21 && r.y + r.height <= 26 && r.x >= 9.5)
    if (!gapStrip) throw new Error("Expected gap strip scrap region between rects")
    expect(gapStrip.height).toBeCloseTo(3, 1)
  })

  it("B2. rotated rectangle produces no waste (no phantom corner crescents)", () => {
    // Sheet-AABB-based crescent compute over-reported waste for any
    // rotated rectangle: bbox − rotated-rect = four large corner
    // triangles, even though the rectangle itself has zero envelope
    // waste. The local-coords envelope compute fixes this — envelope
    // and shape are identical in template-local space.
    const parts = [rectTemplate("rect-A", 24, 12)]
    const placements = [{ id: "p1", templateId: "rect-A", x: 30, y: 18, rotationRad: Math.PI / 6 }]

    const { scrap } = computeAdaptiveRegions(placements, parts, STOCK)

    expect(scrap).toEqual([])
  })

  it("C. waste classification is stable when an unrelated shape is added", () => {
    // Reproduces the user's observation in issue #116:
    //   "i added a circle then the waste above it goes away then appears
    //    to its left even tho its no where near it"
    // Place a disc with corner crescents (these are real per-part waste
    // and SHOULD appear). Then add a far-away rectangle that has no
    // closed-trap geometry near it. The disc's crescent regions must
    // still appear at the same coordinates regardless of whether the
    // distant rect is present.
    const parts = [discTemplate("disc-A", 10), rectTemplate("rect-B", 12, 8)]

    const { scrap: withoutRect } = computeAdaptiveRegions(
      [place("d1", "disc-A", 10, 10)],
      parts,
      STOCK
    )
    const { scrap: withRect } = computeAdaptiveRegions(
      [place("d1", "disc-A", 10, 10), place("r1", "rect-B", 70, 30)],
      parts,
      STOCK
    )

    // Sort by (y,x,w,h) is applied by computeAdaptiveRegions — the
    // disc's crescents should appear at identical coordinates in both
    // computations, regardless of the unrelated rect being added.
    const discRegionsWithout = withoutRect.filter((r) => r.x < 25 && r.y < 25)
    const discRegionsWith = withRect.filter((r) => r.x < 25 && r.y < 25)

    expect(discRegionsWith.length).toBe(discRegionsWithout.length)
    for (let i = 0; i < discRegionsWithout.length; i++) {
      expect(discRegionsWith[i].x).toBeCloseTo(discRegionsWithout[i].x, 4)
      expect(discRegionsWith[i].y).toBeCloseTo(discRegionsWithout[i].y, 4)
      expect(discRegionsWith[i].width).toBeCloseTo(discRegionsWithout[i].width, 4)
      expect(discRegionsWith[i].height).toBeCloseTo(discRegionsWithout[i].height, 4)
    }
  })

  it("D. scrap output is sorted by (y, x, w, h) for stable React keys", () => {
    // Two discs and a closed trap — should produce multiple scrap
    // polygons. They must come back in y-then-x order so the renderer
    // assigns consistent keys across re-renders.
    const parts = [discTemplate("disc-A", 10), rectTemplate("rect-B", 24, 12)]
    const placements = [
      place("d1", "disc-A", 60, 30),
      place("d2", "disc-A", 10, 5),
      place("r1", "rect-B", 30, 20),
    ]

    const { scrap } = computeAdaptiveRegions(placements, parts, STOCK)

    for (let i = 1; i < scrap.length; i++) {
      const prev = scrap[i - 1]
      const cur = scrap[i]
      const isInOrder =
        prev.y < cur.y ||
        (prev.y === cur.y && prev.x < cur.x) ||
        (prev.y === cur.y && prev.x === cur.x && prev.width < cur.width) ||
        (prev.y === cur.y &&
          prev.x === cur.x &&
          prev.width === cur.width &&
          prev.height <= cur.height)
      expect(isInOrder).toBe(true)
    }
  })

  it("D2. moving a far rectangle does not change the disc's crescent waste (image A/B repro)", () => {
    // Direct user-screenshot regression: in the user's video, moving
    // rectangle B closer to rectangle A made phantom strips appear
    // around A — even though A's geometry was unchanged. Under the
    // shape-envelope-only rule, A's crescents depend only on A's own
    // shape, so they're invariant under any other placement's motion.
    const parts = [discTemplate("disc-A", 12), rectTemplate("rect-B", 18, 10)]
    const baseline = computeAdaptiveRegions([place("d1", "disc-A", 8, 8)], parts, STOCK)
    const farRect = computeAdaptiveRegions(
      [place("d1", "disc-A", 8, 8), place("r1", "rect-B", 70, 35)],
      parts,
      STOCK
    )
    const closeRect = computeAdaptiveRegions(
      [place("d1", "disc-A", 8, 8), place("r1", "rect-B", 24, 8)],
      parts,
      STOCK
    )

    // The disc's crescents (4 corner crescents around the 12" disc at
    // origin (8,8)) should be identical in all three cases.
    const discRegions = (regions: typeof baseline.scrap) =>
      regions.filter((r) => r.x < 22 && r.y < 22)

    const a = discRegions(baseline.scrap)
    const b = discRegions(farRect.scrap)
    const c = discRegions(closeRect.scrap)

    expect(b.length).toBe(a.length)
    expect(c.length).toBe(a.length)
    for (let i = 0; i < a.length; i++) {
      expect(b[i].x).toBeCloseTo(a[i].x, 4)
      expect(b[i].y).toBeCloseTo(a[i].y, 4)
      expect(c[i].x).toBeCloseTo(a[i].x, 4)
      expect(c[i].y).toBeCloseTo(a[i].y, 4)
    }
  })

  it("E. empty placements yield empty regions", () => {
    const { offcuts, scrap } = computeAdaptiveRegions([], [rectTemplate("rect-A", 24, 12)], STOCK)
    expect(offcuts).toEqual([])
    expect(scrap).toEqual([])
  })

  it("F. degenerate stock yields empty regions", () => {
    const { offcuts, scrap } = computeAdaptiveRegions(
      [place("p1", "rect-A", 0, 0)],
      [rectTemplate("rect-A", 24, 12)],
      { ...STOCK, width: 0, length: 0 }
    )
    expect(offcuts).toEqual([])
    expect(scrap).toEqual([])
  })

  it("G. four rects fully surrounding a center pocket → pocket renders as scrap", () => {
    // Layout (96×48 stock):
    //   - top wall:    56×18 at (20, 0)   covers x 20..76, y 0..18
    //   - bottom wall: 56×18 at (20, 30)  covers x 20..76, y 30..48
    //   - left wall:   20×12 at (20, 18)  covers x 20..40, y 18..30
    //   - right wall:  20×12 at (56, 18)  covers x 56..76, y 18..30
    // Pocket: x 40..56, y 18..30 = 16×12, fully enclosed.
    const parts = [
      rectTemplate("top-wall", 56, 18),
      rectTemplate("bot-wall", 56, 18),
      rectTemplate("left-wall", 20, 12),
      rectTemplate("right-wall", 20, 12),
    ]
    const placements = [
      place("p1", "top-wall", 20, 0),
      place("p2", "bot-wall", 20, 30),
      place("p3", "left-wall", 20, 18),
      place("p4", "right-wall", 56, 18),
    ]

    const { scrap } = computeAdaptiveRegions(placements, parts, STOCK)

    // Expect a scrap region whose bbox matches the inner pocket.
    const pocket = scrap.find((r) => Math.abs(r.x - 40) < 0.5 && Math.abs(r.y - 18) < 0.5)
    if (!pocket) throw new Error("Expected enclosed pocket scrap region")
    expect(pocket.width).toBeCloseTo(16, 1)
    expect(pocket.height).toBeCloseTo(12, 1)
  })

  it("I. narrow gap between two full-width rects IS classified as scrap (per-side gap)", () => {
    // Two 96×22 rects spanning the full sheet width with a 3" gap
    // between them. Per-side gap detection emits the gap as waste
    // because the parts are 3" apart (< MIN_USABLE_GAP_IN). The earlier
    // pocket-only model treated this as "open frontier" because the
    // gap reaches the stock left/right edges, but per the user's
    // intent (issue #116) any narrow space between adjacent parts is
    // waste regardless of boundary contact.
    const parts = [rectTemplate("wide", 96, 22)]
    const placements = [place("p1", "wide", 0, 0), place("p2", "wide", 0, 25)]

    const { scrap } = computeAdaptiveRegions(placements, parts, STOCK)

    const gapStrip = scrap.find((r) => r.y >= 21 && r.y + r.height <= 26)
    if (!gapStrip) throw new Error("Expected full-width gap strip scrap region")
    expect(gapStrip.width).toBeCloseTo(96, 1)
    expect(gapStrip.height).toBeCloseTo(3, 1)
  })

  it("J. parts placed with ample free space yield only shape-envelope waste, no edge-gap waste", () => {
    // Place each part deep inside the sheet so every side has > 6"
    // gap to the nearest edge or other part. Per-side gap detection
    // emits nothing for these placements; only the disc's corner
    // crescents (shape-envelope waste) should appear.
    const parts = [
      discTemplate("disc-A", 12),
      rectTemplate("rect-B", 18, 10),
      rectTemplate("rect-C", 14, 8),
    ]
    const placements = [
      place("d1", "disc-A", 10, 10), // disc at (10..22, 10..22) — 10" from top/left edges
      place("r1", "rect-B", 40, 25), // rect at (40..58, 25..35)
      place("r2", "rect-C", 70, 12), // rect at (70..84, 12..20) — 12" from top, 12" from right
    ]

    const { scrap } = computeAdaptiveRegions(placements, parts, STOCK)

    // Only the disc's crescents around (10,10)..(22,22) should appear.
    for (const region of scrap) {
      expect(region.x).toBeLessThan(24)
      expect(region.y).toBeLessThan(24)
    }
    expect(scrap.length).toBeGreaterThan(0) // disc crescents exist
  })

  it("K0. corner gap between two adjacent visible-side strips is filled (image #29 repro)", () => {
    // Reproduces the user's "weird box" — a part wedged into the upper-
    // left corner with narrow gaps to BOTH the stock left and stock top
    // edges. The two side strips would otherwise leave a small empty
    // square at the part's outer corner; the corner-fill closes it so
    // the union renders as a clean L-shape (or full rect for a four-
    // sided wedge).
    const parts = [rectTemplate("rect-A", 24, 12)]
    const placements = [place("p1", "rect-A", 2, 3)] // 2" left gap, 3" top gap

    const { scrap } = computeAdaptiveRegions(placements, parts, STOCK)

    // The merged scrap should cover the upper-left corner area at
    // (0..2, 0..3) — the corner-fill rectangle. Without the fix it'd
    // be empty. Find any region whose bbox includes (1, 1.5).
    const coversCorner = scrap.some(
      (r) => r.x <= 1 && r.x + r.width >= 1 && r.y <= 1.5 && r.y + r.height >= 1.5
    )
    expect(coversCorner).toBe(true)
  })

  it("K. narrow strip between part and stock top edge IS classified as scrap (image #26 repro)", () => {
    // Reproduces the user's screenshot in issue #116: rect placed near
    // the top of the sheet leaves a thin strip between its top edge
    // and the stock top. Per-side gap detection emits this strip
    // because it's < MIN_USABLE_GAP_IN.
    const parts = [rectTemplate("rect-A", 30, 16)]
    const placements = [place("p1", "rect-A", 20, 3)] // 3" gap above

    const { scrap } = computeAdaptiveRegions(placements, parts, STOCK)

    const topStrip = scrap.find((r) => r.y < 1 && r.height < 4)
    if (!topStrip) throw new Error("Expected top edge strip scrap region")
    expect(topStrip.width).toBeCloseTo(30, 1)
    expect(topStrip.height).toBeCloseTo(3, 1)
  })
})
