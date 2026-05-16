import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Point2D } from "@/src/application/packing/types"
import { groupLoopsIntoParts } from "@/src/application/cad/group-parts"
import { parseDxf } from "@/src/application/cad/parse-dxf"
import { connectLoops, pickDefaultLayer } from "@/src/application/cad/connect-loops"

function rect(cx: number, cy: number, w: number, h: number): Point2D[] {
  return [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 },
  ]
}

function signedArea(loop: Point2D[]): number {
  let a = 0
  for (let i = 0; i < loop.length; i++) {
    const p1 = loop[i]
    const p2 = loop[(i + 1) % loop.length]
    a += p1.x * p2.y - p2.x * p1.y
  }
  return a / 2
}

function fixture(name: string): string {
  return readFileSync(resolve("tests/fixtures/dxf", `${name}.dxf`), "utf8")
}

describe("groupLoopsIntoParts", () => {
  it("empty input → empty result", () => {
    expect(groupLoopsIntoParts([])).toEqual([])
  })

  it("two disjoint outer rectangles → two parts, no holes", () => {
    const a = rect(0, 0, 10, 10)
    const b = rect(100, 0, 10, 10)
    const parts = groupLoopsIntoParts([a, b])
    expect(parts).toHaveLength(2)
    expect(parts[0].polygon.holes).toHaveLength(0)
    expect(parts[1].polygon.holes).toHaveLength(0)
  })

  it("outer + one inner → one part with one hole", () => {
    const outer = rect(0, 0, 10, 10)
    const inner = rect(0, 0, 4, 4)
    const parts = groupLoopsIntoParts([outer, inner])
    expect(parts).toHaveLength(1)
    expect(parts[0].polygon.holes).toHaveLength(1)
  })

  it("outer + 4 inner holes (bracket) → one part with 4 holes", () => {
    const outer = rect(0, 0, 20, 20)
    const holes = [rect(-7, -7, 2, 2), rect(7, -7, 2, 2), rect(-7, 7, 2, 2), rect(7, 7, 2, 2)]
    const parts = groupLoopsIntoParts([outer, ...holes])
    expect(parts).toHaveLength(1)
    expect(parts[0].polygon.holes).toHaveLength(4)
  })

  it("nested-holes (outer + hole + island in hole) → two parts", () => {
    const outer = rect(0, 0, 20, 20)
    const hole = rect(0, 0, 10, 10)
    const island = rect(0, 0, 4, 4)
    const parts = groupLoopsIntoParts([outer, hole, island])
    expect(parts).toHaveLength(2)
    // Outer part has 1 hole; island part has no holes.
    const outerPart = parts.find((p) => Math.abs(signedArea(p.polygon.outer)) > 100)
    expect(outerPart?.polygon.holes).toHaveLength(1)
    const islandPart = parts.find((p) => Math.abs(signedArea(p.polygon.outer)) < 100)
    expect(islandPart?.polygon.holes).toHaveLength(0)
  })

  it("CW outer + CW hole input → outputs CCW outer, CW hole (winding enforcement)", () => {
    // CW outer (vertices in clockwise order; signed area < 0)
    const cwOuter = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ]
    const cwHole = [
      { x: 2, y: 2 },
      { x: 2, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 2 },
    ]
    const parts = groupLoopsIntoParts([cwOuter, cwHole])
    expect(parts).toHaveLength(1)
    // Outer should be CCW (signed area > 0) — matches sanitize-polygon-with-holes.ts
    expect(signedArea(parts[0].polygon.outer)).toBeGreaterThan(0)
    // Hole should be CW (signed area < 0) — matches sanitize-polygon-with-holes.ts
    expect(signedArea(parts[0].polygon.holes[0])).toBeLessThan(0)
  })

  it("each candidate has a bbox matching its outer ring", () => {
    const outer = rect(5, 10, 20, 30)
    const parts = groupLoopsIntoParts([outer])
    expect(parts).toHaveLength(1)
    expect(parts[0].bbox).toEqual({ minX: -5, maxX: 15, minY: -5, maxY: 25 })
  })
})

describe("groupLoopsIntoParts edge cases", () => {
  it("identical duplicate loops do not hang (regression)", () => {
    const dup = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const start = Date.now()
    const parts = groupLoopsIntoParts([dup, [...dup]]) // deep copy to ensure identical-by-value
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(100) // must terminate quickly
    // Both loops become outers since neither strictly larger than the other.
    expect(parts).toHaveLength(2)
    expect(parts[0].polygon.holes).toHaveLength(0)
    expect(parts[1].polygon.holes).toHaveLength(0)
  })

  it("empty loop filtered silently", () => {
    const valid = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(() => groupLoopsIntoParts([[], valid])).not.toThrow()
    const parts = groupLoopsIntoParts([[], valid])
    expect(parts).toHaveLength(1)
  })

  it("2-vertex degenerate loop filtered", () => {
    const valid = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const degen = [
      { x: 100, y: 0 },
      { x: 200, y: 0 },
    ]
    const parts = groupLoopsIntoParts([degen, valid])
    expect(parts).toHaveLength(1)
  })

  it("hole sharing a vertex with the outer loop is still classified as a hole", () => {
    // Outer rectangle 0..10 × 0..10.
    const outer: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    // Inner triangle whose first vertex coincides with the outer's (0, 0).
    // Before PR #280 fix, pointInPolygon(inner[0], outer) — with inner[0]
    // sitting exactly on the outer's boundary — was classified by the
    // half-open ray-cast as outside, promoting the hole to a depth-0
    // outer and producing TWO parts. The centroid sample point avoids
    // the boundary entirely.
    const inner: Point2D[] = [
      { x: 0, y: 0 }, // shared with outer's bottom-left corner
      { x: 4, y: 1 },
      { x: 1, y: 4 },
    ]
    const parts = groupLoopsIntoParts([outer, inner])
    expect(parts).toHaveLength(1)
    expect(parts[0].polygon.holes).toHaveLength(1)
  })
})

describe("group-parts integration with DXF fixtures", () => {
  it("bracket-with-bolt-holes.dxf → 1 part with 4 holes", () => {
    const doc = parseDxf(fixture("bracket-with-bolt-holes"))
    const layer = pickDefaultLayer(doc)
    const { loops } = connectLoops(doc, layer)
    const parts = groupLoopsIntoParts(loops)
    expect(parts).toHaveLength(1)
    expect(parts[0].polygon.holes).toHaveLength(4)
  })

  it("two-disjoint-parts.dxf → 2 parts, no holes", () => {
    const doc = parseDxf(fixture("two-disjoint-parts"))
    const layer = pickDefaultLayer(doc)
    const { loops } = connectLoops(doc, layer)
    const parts = groupLoopsIntoParts(loops)
    expect(parts).toHaveLength(2)
    expect(parts[0].polygon.holes).toHaveLength(0)
    expect(parts[1].polygon.holes).toHaveLength(0)
  })

  it("nested-holes.dxf → 2 parts (outer with 1 hole + island)", () => {
    const doc = parseDxf(fixture("nested-holes"))
    const layer = pickDefaultLayer(doc)
    const { loops } = connectLoops(doc, layer)
    const parts = groupLoopsIntoParts(loops)
    expect(parts).toHaveLength(2)
  })

  it("ring-gasket.dxf → 1 part with 1 hole", () => {
    const doc = parseDxf(fixture("ring-gasket"))
    const layer = pickDefaultLayer(doc)
    const { loops } = connectLoops(doc, layer)
    const parts = groupLoopsIntoParts(loops)
    expect(parts).toHaveLength(1)
    expect(parts[0].polygon.holes).toHaveLength(1)
  })
})
