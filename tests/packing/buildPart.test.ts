import { describe, it, expect } from "vitest"
import { buildPart } from "@/src/application/packing/buildPart"
import type { ShapeSpec } from "@/src/application/packing/types"

// Polygon math for spec-able shapes (rect, circle, trapezoid, ngon,
// sector) lives in Rust now (`engine/crates/rf-layout/src/application/
// shape_builder.rs`). buildPart's job for spec inputs is just to
// pass `shapeSpec` through; polygon is left undefined and Rust
// materialises it pre-pack.
//
// Polygon math is still exercised TS-side for raw-geometry callers
// (DXF imports, hand-drawn parts), so the polygon-passthrough +
// normalization tests live below.

describe("buildPart — spec-only (polygon materialised by Rust)", () => {
  it("rect spec: polygon left undefined, shapeSpec passed through", () => {
    const spec: ShapeSpec = { kind: "rect", params: { width: 10, height: 5 } }
    const part = buildPart({
      shapeId: "r1",
      quantity: 1,
      shapeSpec: spec,
      allowRotation: true,
    })
    expect(part.polygon).toBeUndefined()
    expect(part.shapeSpec).toEqual(spec)
    expect(part.shapeId).toBe("r1")
    expect(part.quantity).toBe(1)
    expect(part.allowRotation).toBe(true)
  })

  it("circle spec: polygon left undefined, shapeSpec passed through", () => {
    const spec: ShapeSpec = { kind: "circle", params: { diameter: 10 } }
    const part = buildPart({
      shapeId: "c1",
      quantity: 1,
      shapeSpec: spec,
      allowRotation: true,
    })
    expect(part.polygon).toBeUndefined()
    expect(part.shapeSpec).toEqual(spec)
  })

  it("trapezoid spec: polygon left undefined, shapeSpec passed through", () => {
    const spec: ShapeSpec = {
      kind: "trapezoid",
      params: { topWidth: 6, bottomWidth: 10, height: 4 },
    }
    const part = buildPart({
      shapeId: "t1",
      quantity: 1,
      shapeSpec: spec,
      allowRotation: true,
    })
    expect(part.polygon).toBeUndefined()
    expect(part.shapeSpec).toEqual(spec)
  })

  it("sector spec: polygon left undefined, shapeSpec passed through", () => {
    const spec: ShapeSpec = {
      kind: "sector",
      params: { innerRadius: 2, outerRadius: 5, arcDegrees: 90 },
    }
    const part = buildPart({
      shapeId: "s1",
      quantity: 1,
      shapeSpec: spec,
      allowRotation: true,
    })
    expect(part.polygon).toBeUndefined()
    expect(part.shapeSpec).toEqual(spec)
  })

  it("ngon spec: polygon left undefined, shapeSpec passed through", () => {
    const spec: ShapeSpec = { kind: "ngon", params: { sides: 6, radius: 5 } }
    const part = buildPart({
      shapeId: "n1",
      quantity: 1,
      shapeSpec: spec,
      allowRotation: true,
    })
    expect(part.polygon).toBeUndefined()
    expect(part.shapeSpec).toEqual(spec)
  })

  it("optional fields (grainAxis, difficulty, tag) round-trip onto Part", () => {
    const part = buildPart({
      shapeId: "r1",
      quantity: 3,
      shapeSpec: { kind: "rect", params: { width: 10, height: 5 } },
      allowRotation: false,
      grainAxis: "width",
      difficulty: 1.5,
      tag: "G2",
    })
    expect(part.grainAxis).toBe("width")
    expect(part.difficulty).toBe(1.5)
    expect(part.tag).toBe("G2")
    expect(part.allowRotation).toBe(false)
    expect(part.quantity).toBe(3)
  })
})

describe("buildPart — custom / DXF passthrough", () => {
  it("accepts a polygon directly (for imported shapes)", () => {
    const part = buildPart({
      shapeId: "dxf1",
      quantity: 1,
      polygon: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      allowRotation: true,
    })
    expect(part.polygon?.outer).toHaveLength(4)
    expect(part.polygon?.holes).toEqual([])
    expect(part.shapeSpec).toBeUndefined()
  })

  it("normalizes an offset polygon to min-corner (0,0)", () => {
    const part = buildPart({
      shapeId: "dxf1",
      quantity: 1,
      polygon: [
        { x: 10, y: 20 },
        { x: 14, y: 20 },
        { x: 14, y: 23 },
        { x: 10, y: 23 },
      ],
      allowRotation: true,
    })
    expect(part.polygon).toBeDefined()
    if (!part.polygon) return
    const xs = part.polygon.outer.map((p) => p.x)
    const ys = part.polygon.outer.map((p) => p.y)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.min(...ys)).toBe(0)
  })

  it("throws when polygon has fewer than 3 vertices", () => {
    expect(() =>
      buildPart({
        shapeId: "dxf1",
        quantity: 1,
        polygon: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        allowRotation: true,
      })
    ).toThrow(/at least 3 vertices/i)
  })

  it("throws when neither shapeSpec nor polygon is provided", () => {
    expect(() =>
      buildPart({
        shapeId: "dxf1",
        quantity: 1,
        allowRotation: true,
      })
    ).toThrow(/shapeSpec or polygon/i)
  })

  it("polygon + shapeSpec both supplied: polygon wins (Rust short-circuits when present)", () => {
    const part = buildPart({
      shapeId: "mix",
      quantity: 1,
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      shapeSpec: { kind: "rect", params: { width: 10, height: 5 } },
      allowRotation: true,
    })
    expect(part.polygon?.outer).toHaveLength(3)
    expect(part.shapeSpec).toEqual({ kind: "rect", params: { width: 10, height: 5 } })
  })
})
