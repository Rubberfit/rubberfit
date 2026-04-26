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
 * threshold as scrap, including OPEN-EDGE slivers (one side touching a
 * part, the other facing unused stock). The greedy carve order also
 * depends on the topology of the free polygon, so adding a shape
 * elsewhere shuffles which rects come out.
 *
 * Fix: filter the thin-rect output through `isClosedTrap` — keep only
 * rects whose narrow axis is blocked on BOTH sides (between two parts,
 * or between a part and a stock edge). Sort the resulting scrap by
 * (y, x, w, h) so React keys stay stable across re-renders.
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

  it("B. closed trap between two parallel rects IS classified as scrap", () => {
    // Two rects placed with a 4" vertical gap between them (gap height
    // is below the 6" usable-strip threshold). The strip is bounded by
    // a part above AND a part below — a real waste pocket.
    const parts = [rectTemplate("rect-A", 24, 12)]
    const placements = [
      place("p1", "rect-A", 10, 10),
      // 4" gap (rect-A bottom = 10+12 = 22, next top = 26)
      place("p2", "rect-A", 10, 26),
    ]

    const { scrap } = computeAdaptiveRegions(placements, parts, STOCK)

    // At least one scrap polygon should fall in the trapped strip's
    // y range and overlap its x extent.
    const trappedRows = scrap.filter((s) => s.y > 21 && s.y + s.height < 27)
    expect(trappedRows.length).toBeGreaterThan(0)
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
      const inOrder =
        prev.y < cur.y ||
        (prev.y === cur.y && prev.x < cur.x) ||
        (prev.y === cur.y && prev.x === cur.x && prev.width <= cur.width)
      expect(inOrder).toBe(true)
    }
  })

  it("E. empty placements yield empty regions", () => {
    const { offcuts, scrap } = computeAdaptiveRegions(
      [],
      [rectTemplate("rect-A", 24, 12)],
      STOCK
    )
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
})
