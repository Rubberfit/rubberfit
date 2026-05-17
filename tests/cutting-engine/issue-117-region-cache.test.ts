/**
 * Regression tests for the per-placement region cache that keeps
 * Free-roam drag interactive at high shape counts (issue #117).
 *
 * The cache memoizes per-placement geometry (sheet polygon, Clipper
 * path, bbox, envelope-waste polys) so a drag tick re-runs the
 * expensive Clipper passes only for the moved placement; every
 * stationary placement reuses its cached entry. Pocket and per-side
 * gap passes still recompute every tick because moving one part can
 * change another's pocket membership / nearest blocker.
 *
 * The contract tested here is the equivalence guarantee: for any
 * inputs, `computeAdaptiveRegions(p, parts, stock, cache)` produces
 * byte-identical output to `computeAdaptiveRegions(p, parts, stock)`.
 */
import { describe, expect, it } from "vitest"
import { computeAdaptiveRegions } from "@/app/dashboard/cutting-engine/_components/manual-layout/regions"
import { makeRegionCache } from "@/app/dashboard/cutting-engine/_components/manual-layout/region-cache"
import type { ManualPlacement } from "@/app/dashboard/cutting-engine/_components/manual-layout/collision"
import type { PartTemplate } from "@/app/dashboard/cutting-engine/_components/preset-template-data"
import type { StockConfig } from "@/app/dashboard/cutting-engine/_components/stock-preview-configurator"
import { circleToPolygon } from "@/nesting/shape-to-polygon"

function rectTemplate(id: string, width: number, length: number): PartTemplate {
  return {
    id,
    partType: "rectangle",
    label: id,
    summary: `${width}x${length}`,
    quantity: 1,
    category: "custom",
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

function ringTemplate(id: string, outerD: number, innerD: number): PartTemplate {
  return {
    id,
    partType: "cylinder",
    label: id,
    summary: `⌀${outerD}/${innerD}`,
    quantity: 1,
    category: "custom",
    diameter: outerD,
    width: outerD,
    length: outerD,
    innerRadius: innerD / 2,
    outerRadius: outerD / 2,
    renderShape: "ring",
    // ringTemplate must actually have an inner hole — the previous
    // fixture used an empty holes array so "ring crescent + inner-hole
    // geometry" tests were really exercising solid-disc behavior.
    // `sanitize-polygon-with-holes` runs downstream and flips winding
    // as needed, so we don't pre-reverse here.
    polygon: { outer: circleToPolygon(outerD, 48), holes: [circleToPolygon(innerD, 48)] },
  }
}

function place(id: string, templateId: string, x: number, y: number, rot = 0): ManualPlacement {
  return { id, templateId, x, y, rotationRad: rot }
}

const STOCK: StockConfig = {
  width: 96,
  length: 48,
  thickness: 0.06,
  material: "EPDM",
  kerf: 0.125,
}

/**
 * Deep equality on the parts of `ComputedRegions` that the canvas
 * + metrics actually consume. Polygons must be in the same order
 * (the function is stable-sorted), and each scrap region's bbox +
 * polygon vertices must agree.
 */
function expectRegionsEqual(
  actual: ReturnType<typeof computeAdaptiveRegions>,
  expected: ReturnType<typeof computeAdaptiveRegions>
): void {
  expect(actual.offcuts).toEqual(expected.offcuts)
  expect(actual.scrap.length).toBe(expected.scrap.length)
  for (let i = 0; i < expected.scrap.length; i++) {
    const a = actual.scrap[i]
    const e = expected.scrap[i]
    expect(a.x).toBeCloseTo(e.x, 6)
    expect(a.y).toBeCloseTo(e.y, 6)
    expect(a.width).toBeCloseTo(e.width, 6)
    expect(a.height).toBeCloseTo(e.height, 6)
    const aPoly = a.polygon ?? []
    const ePoly = e.polygon ?? []
    expect(aPoly.length).toBe(ePoly.length)
    for (let j = 0; j < ePoly.length; j++) {
      expect(aPoly[j].x).toBeCloseTo(ePoly[j].x, 6)
      expect(aPoly[j].y).toBeCloseTo(ePoly[j].y, 6)
    }
  }
}

describe("issue #117 — region cache equivalence", () => {
  it("two empty inputs produce identical output (empty cache + empty placements)", () => {
    const cache = makeRegionCache()
    const a = computeAdaptiveRegions([], [], STOCK)
    const b = computeAdaptiveRegions([], [], STOCK, cache)
    expectRegionsEqual(a, b)
  })

  it("single rectangle: cached and uncached are byte-identical", () => {
    const parts = [rectTemplate("rect-A", 24, 12)]
    const placements = [place("a1", "rect-A", 5, 5)]
    const cache = makeRegionCache()
    const uncached = computeAdaptiveRegions(placements, parts, STOCK)
    const cached = computeAdaptiveRegions(placements, parts, STOCK, cache)
    expectRegionsEqual(cached, uncached)
  })

  it("disc with crescent waste: cached and uncached are byte-identical", () => {
    const parts = [discTemplate("disc-A", 18)]
    const placements = [place("a1", "disc-A", 10, 10)]
    const cache = makeRegionCache()
    const uncached = computeAdaptiveRegions(placements, parts, STOCK)
    const cached = computeAdaptiveRegions(placements, parts, STOCK, cache)
    expectRegionsEqual(cached, uncached)
  })

  it("ring with crescent + inner-hole geometry: cached and uncached match", () => {
    const parts = [ringTemplate("ring-A", 24, 12)]
    const placements = [place("a1", "ring-A", 10, 10)]
    const cache = makeRegionCache()
    const uncached = computeAdaptiveRegions(placements, parts, STOCK)
    const cached = computeAdaptiveRegions(placements, parts, STOCK, cache)
    expectRegionsEqual(cached, uncached)
  })

  it("multi-part scene (rect + disc + ring) equivalence", () => {
    const parts = [
      rectTemplate("rect-A", 20, 10),
      discTemplate("disc-B", 16),
      ringTemplate("ring-C", 24, 12),
    ]
    const placements = [
      place("a1", "rect-A", 2, 2),
      place("b1", "disc-B", 30, 5),
      place("c1", "ring-C", 60, 18),
    ]
    const cache = makeRegionCache()
    const uncached = computeAdaptiveRegions(placements, parts, STOCK)
    const cached = computeAdaptiveRegions(placements, parts, STOCK, cache)
    expectRegionsEqual(cached, uncached)
  })

  it("rotated rectangle equivalence", () => {
    const parts = [rectTemplate("rect-A", 24, 12)]
    const placements = [place("a1", "rect-A", 10, 10, Math.PI / 6)]
    const cache = makeRegionCache()
    const uncached = computeAdaptiveRegions(placements, parts, STOCK)
    const cached = computeAdaptiveRegions(placements, parts, STOCK, cache)
    expectRegionsEqual(cached, uncached)
  })

  it("missing template (placement references unknown template id) is skipped in both paths", () => {
    const parts = [rectTemplate("rect-A", 20, 10)]
    const placements = [place("a1", "rect-A", 0, 0), place("ghost", "missing-id", 50, 20)]
    const cache = makeRegionCache()
    const uncached = computeAdaptiveRegions(placements, parts, STOCK)
    const cached = computeAdaptiveRegions(placements, parts, STOCK, cache)
    expectRegionsEqual(cached, uncached)
  })
})

describe("issue #117 — cache freshness across mutations", () => {
  it("moving one placement invalidates only its entry", () => {
    const parts = [rectTemplate("rect-A", 12, 8)]
    const placements = [place("a1", "rect-A", 5, 5), place("a2", "rect-A", 30, 5)]
    const cache = makeRegionCache()

    // Warm up the cache.
    computeAdaptiveRegions(placements, parts, STOCK, cache)
    expect(cache.perPlacement.size).toBe(2)
    const a1Before = cache.perPlacement.get("a1")
    const a2Before = cache.perPlacement.get("a2")
    expect(a1Before).toBeDefined()
    expect(a2Before).toBeDefined()

    // Move a1; a2 stays put.
    const moved = [place("a1", "rect-A", 10, 5), place("a2", "rect-A", 30, 5)]
    computeAdaptiveRegions(moved, parts, STOCK, cache)
    const a1After = cache.perPlacement.get("a1")
    const a2After = cache.perPlacement.get("a2")
    // a1 entry is a fresh object (new geomKey), a2 entry is the SAME reference.
    expect(a1After).toBeDefined()
    expect(a2After).toBe(a2Before)
    expect(a1After).not.toBe(a1Before)
  })

  it("removing a placement evicts its cache entry", () => {
    const parts = [rectTemplate("rect-A", 12, 8)]
    const placements = [place("a1", "rect-A", 5, 5), place("a2", "rect-A", 30, 5)]
    const cache = makeRegionCache()
    computeAdaptiveRegions(placements, parts, STOCK, cache)
    expect(cache.perPlacement.has("a2")).toBe(true)

    // Remove a2.
    computeAdaptiveRegions([placements[0]], parts, STOCK, cache)
    expect(cache.perPlacement.has("a2")).toBe(false)
    expect(cache.perPlacement.has("a1")).toBe(true)
  })

  it("template geometry change (e.g. different polygon at same id) invalidates affected placements", () => {
    const partsBefore = [rectTemplate("rect-A", 12, 8)]
    const partsAfter = [rectTemplate("rect-A", 16, 8)] // wider
    const placements = [place("a1", "rect-A", 5, 5)]
    const cache = makeRegionCache()
    computeAdaptiveRegions(placements, partsBefore, STOCK, cache)
    const before = cache.perPlacement.get("a1")
    expect(before).toBeDefined()

    computeAdaptiveRegions(placements, partsAfter, STOCK, cache)
    const after = cache.perPlacement.get("a1")
    expect(after).toBeDefined()
    expect(after).not.toBe(before)
  })

  it("template id swap on the same placement invalidates the entry", () => {
    const parts = [rectTemplate("rect-A", 12, 8), discTemplate("disc-B", 10)]
    const cache = makeRegionCache()
    const before = [place("a1", "rect-A", 5, 5)]
    computeAdaptiveRegions(before, parts, STOCK, cache)
    const beforeEntry = cache.perPlacement.get("a1")

    const after = [place("a1", "disc-B", 5, 5)]
    computeAdaptiveRegions(after, parts, STOCK, cache)
    const afterEntry = cache.perPlacement.get("a1")
    expect(afterEntry).toBeDefined()
    expect(afterEntry).not.toBe(beforeEntry)
  })

  it("re-running with identical inputs hits the cache for every placement (zero re-encoding)", () => {
    const parts = [
      rectTemplate("rect-A", 12, 8),
      discTemplate("disc-B", 16),
      ringTemplate("ring-C", 20, 10),
    ]
    const placements = [
      place("a1", "rect-A", 0, 0),
      place("b1", "disc-B", 20, 0),
      place("c1", "ring-C", 50, 0),
    ]
    const cache = makeRegionCache()
    computeAdaptiveRegions(placements, parts, STOCK, cache)
    const snap = new Map(cache.perPlacement)

    computeAdaptiveRegions(placements, parts, STOCK, cache)
    expect(cache.perPlacement.size).toBe(snap.size)
    for (const [id, entry] of snap) {
      expect(cache.perPlacement.get(id)).toBe(entry) // same reference -> reused
    }
  })
})

describe("issue #117 — fuzz equivalence (cached vs uncached)", () => {
  // Pseudo-random integer generator with a fixed seed so failures are
  // reproducible.
  function makeRng(seed: number): () => number {
    let state = seed >>> 0
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 0x100000000
    }
  }

  it("50 random placement sets produce byte-identical output across cached / uncached", () => {
    const rng = makeRng(0xc0ffee)
    const parts = [
      rectTemplate("rect-A", 12, 8),
      rectTemplate("rect-B", 18, 6),
      discTemplate("disc-C", 14),
      discTemplate("disc-D", 22),
      ringTemplate("ring-E", 20, 10),
    ]
    for (let trial = 0; trial < 50; trial++) {
      const n = 1 + Math.floor(rng() * 6)
      const placements: ManualPlacement[] = []
      for (let i = 0; i < n; i++) {
        const tpl = parts[Math.floor(rng() * parts.length)]
        const x = rng() * (STOCK.width - 30)
        const y = rng() * (STOCK.length - 30)
        const rot = rng() < 0.3 ? rng() * Math.PI : 0
        placements.push(place(`p${trial}-${i}`, tpl.id, x, y, rot))
      }
      const cache = makeRegionCache()
      const uncached = computeAdaptiveRegions(placements, parts, STOCK)
      const cached = computeAdaptiveRegions(placements, parts, STOCK, cache)
      expectRegionsEqual(cached, uncached)
    }
  })

  it("warm cache survives a sequence of moves and matches a fresh uncached compute at each step", () => {
    const rng = makeRng(0xbeef)
    const parts = [
      rectTemplate("rect-A", 12, 8),
      discTemplate("disc-B", 14),
      ringTemplate("ring-C", 18, 9),
    ]
    const placements: ManualPlacement[] = [
      place("p0", "rect-A", 5, 5),
      place("p1", "disc-B", 25, 8),
      place("p2", "ring-C", 50, 12),
    ]
    const cache = makeRegionCache()
    // Initial compute.
    expectRegionsEqual(
      computeAdaptiveRegions(placements, parts, STOCK, cache),
      computeAdaptiveRegions(placements, parts, STOCK)
    )
    // 20 simulated drag ticks: each tick moves one random placement to
    // a random new position. Cache should keep up exactly.
    for (let tick = 0; tick < 20; tick++) {
      const idx = Math.floor(rng() * placements.length)
      placements[idx] = {
        ...placements[idx],
        x: rng() * (STOCK.width - 30),
        y: rng() * (STOCK.length - 30),
      }
      expectRegionsEqual(
        computeAdaptiveRegions(placements, parts, STOCK, cache),
        computeAdaptiveRegions(placements, parts, STOCK)
      )
    }
  })

  it("stock resize (width/length change) does not corrupt cached output", () => {
    const parts = [rectTemplate("rect-A", 12, 8), discTemplate("disc-B", 14)]
    const placements = [place("a1", "rect-A", 5, 5), place("b1", "disc-B", 25, 8)]
    const cache = makeRegionCache()
    computeAdaptiveRegions(placements, parts, STOCK, cache)
    // Resize stock; compute again.
    const resizedStock: StockConfig = {
      width: 60,
      length: 30,
      thickness: 0.06,
      material: "EPDM",
      kerf: 0.125,
    }
    expectRegionsEqual(
      computeAdaptiveRegions(placements, parts, resizedStock, cache),
      computeAdaptiveRegions(placements, parts, resizedStock)
    )
  })
})
