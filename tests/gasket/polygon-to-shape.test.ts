/**
 * Unit tests for polygon-to-shape helpers — these are pure
 * geometry conversions that don't touch WebGL, so they can run in
 * happy-dom (the live GasketPreview3D component can't, but R3F's
 * geometry-prep math can be exercised here).
 */
import { describe, expect, it } from "vitest"

import { polygonBbox, polygonToShape } from "@/src/application/gasket/polygon-to-shape"
import { buildRingGasket } from "@/src/application/gasket/ring-gasket"

describe("polygonBbox", () => {
  it("returns sentinel zero-bbox for an empty polygon", () => {
    const b = polygonBbox({ outer: [], holes: [] })
    expect(b.width).toBe(1)
    expect(b.height).toBe(1)
    expect(b.cx).toBe(0)
    expect(b.cy).toBe(0)
  })

  it("computes bbox from outer + holes together", () => {
    const b = polygonBbox({
      outer: [
        { x: -5, y: -3 },
        { x: 5, y: -3 },
        { x: 5, y: 3 },
        { x: -5, y: 3 },
      ],
      holes: [
        [
          { x: -1, y: -1 },
          { x: 1, y: -1 },
          { x: 1, y: 1 },
          { x: -1, y: 1 },
        ],
      ],
    })
    expect(b.minX).toBe(-5)
    expect(b.maxX).toBe(5)
    expect(b.minY).toBe(-3)
    expect(b.maxY).toBe(3)
    expect(b.width).toBe(10)
    expect(b.height).toBe(6)
    expect(b.cx).toBe(0)
    expect(b.cy).toBe(0)
  })

  it("handles a real ring gasket from the primitive builders", () => {
    const ring = buildRingGasket({ outerDiameter: 12, innerDiameter: 8 })
    const b = polygonBbox(ring)
    // OD 12 -> radius 6 -> bbox from -6 to +6 within tessellation error
    expect(b.minX).toBeCloseTo(-6, 1)
    expect(b.maxX).toBeCloseTo(6, 1)
    expect(b.cx).toBeCloseTo(0, 4)
    expect(b.cy).toBeCloseTo(0, 4)
  })
})

describe("polygonToShape", () => {
  it("emits a THREE.Shape with one Path per hole in the input", () => {
    const ring = buildRingGasket({ outerDiameter: 10, innerDiameter: 6 })
    const shape = polygonToShape(ring)
    // outer + 1 hole — Three's `Shape.holes` is a `Path[]`.
    expect(shape.holes).toHaveLength(1)
    // Outer vertex count matches the input ring's outer vertex count.
    expect(shape.getPoints().length).toBeGreaterThanOrEqual(ring.outer.length)
  })

  it("emits an empty holes array for a polygon with no holes (obround case)", () => {
    const shape = polygonToShape({
      outer: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 2 },
        { x: 0, y: 2 },
      ],
      holes: [],
    })
    expect(shape.holes).toHaveLength(0)
  })
})
