import { describe, expect, it } from "vitest"
import {
  getPolygonBounds,
  polygonNetArea,
} from "@/app/dashboard/cutting-engine/_components/polygon-bounds"
import type { PolygonWithHoles } from "@/src/application/packing/types"

describe("polygonNetArea", () => {
  it("returns outer area when polygon has no holes", () => {
    const polygon: PolygonWithHoles = {
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      holes: [],
    }
    expect(polygonNetArea(polygon)).toBe(100)
  })

  it("subtracts hole area from outer area", () => {
    const polygon: PolygonWithHoles = {
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      holes: [
        [
          { x: 3, y: 3 },
          { x: 7, y: 3 },
          { x: 7, y: 7 },
          { x: 3, y: 7 },
        ],
      ],
    }
    // 100 (outer) - 16 (hole) = 84
    expect(polygonNetArea(polygon)).toBe(84)
  })

  it("clamps to 0 for malformed (hole-larger-than-outer) input", () => {
    // Small outer + giant hole — without the clamp the result is
    // negative and poisons downstream sqft math (requested-area
    // totals, utilization ratios).
    const polygon: PolygonWithHoles = {
      outer: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      holes: [
        [
          { x: -10, y: -10 },
          { x: 10, y: -10 },
          { x: 10, y: 10 },
          { x: -10, y: 10 },
        ],
      ],
    }
    expect(polygonNetArea(polygon)).toBe(0)
  })
})

describe("getPolygonBounds", () => {
  it("returns zero-extent bbox for empty outer", () => {
    const polygon: PolygonWithHoles = { outer: [], holes: [] }
    expect(getPolygonBounds(polygon)).toEqual({
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      width: 0,
      height: 0,
    })
  })

  it("computes width/height from outer extent", () => {
    const polygon: PolygonWithHoles = {
      outer: [
        { x: 5, y: 10 },
        { x: 15, y: 10 },
        { x: 15, y: 25 },
        { x: 5, y: 25 },
      ],
      holes: [],
    }
    const bounds = getPolygonBounds(polygon)
    expect(bounds.minX).toBe(5)
    expect(bounds.maxX).toBe(15)
    expect(bounds.minY).toBe(10)
    expect(bounds.maxY).toBe(25)
    expect(bounds.width).toBe(10)
    expect(bounds.height).toBe(15)
  })
})
