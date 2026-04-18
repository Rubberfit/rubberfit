import { describe, it, expect } from "vitest"
import { buildPart } from "@/src/application/packing/buildPart"
import type { ShapeSpec } from "@/src/application/packing/types"

describe("buildPart — rect", () => {
  it("produces a 4-vertex CCW polygon with min-corner at (0,0)", () => {
    const spec: ShapeSpec = { kind: "rect", params: { width: 10, height: 5 } }
    const part = buildPart({
      shapeId: "r1",
      quantity: 1,
      shapeSpec: spec,
      allowRotation: true,
    })

    expect(part.polygon).toHaveLength(4)
    const xs = part.polygon.map((p) => p.x)
    const ys = part.polygon.map((p) => p.y)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...xs)).toBeCloseTo(10, 6)
    expect(Math.max(...ys)).toBeCloseTo(5, 6)
  })

  it("preserves shapeSpec as UI hint", () => {
    const spec: ShapeSpec = { kind: "rect", params: { width: 10, height: 5 } }
    const part = buildPart({
      shapeId: "r1",
      quantity: 1,
      shapeSpec: spec,
      allowRotation: true,
    })
    expect(part.shapeSpec).toEqual(spec)
  })

  it("throws on zero width", () => {
    expect(() =>
      buildPart({
        shapeId: "r1",
        quantity: 1,
        shapeSpec: { kind: "rect", params: { width: 0, height: 5 } },
        allowRotation: true,
      })
    ).toThrow(/width must be positive/i)
  })
})
