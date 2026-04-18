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

describe("buildPart — circle", () => {
  it("produces a 24-vertex polygon by default", () => {
    const part = buildPart({
      shapeId: "c1",
      quantity: 1,
      shapeSpec: { kind: "circle", params: { diameter: 10 } },
      allowRotation: true,
    })
    expect(part.polygon).toHaveLength(24)
  })

  it("polygon spans diameter with min-corner at (0,0)", () => {
    const part = buildPart({
      shapeId: "c1",
      quantity: 1,
      shapeSpec: { kind: "circle", params: { diameter: 10 } },
      allowRotation: true,
    })
    const xs = part.polygon.map((p) => p.x)
    const ys = part.polygon.map((p) => p.y)
    expect(Math.min(...xs)).toBeCloseTo(0, 3)
    expect(Math.min(...ys)).toBeCloseTo(0, 3)
    expect(Math.max(...xs)).toBeCloseTo(10, 3)
    expect(Math.max(...ys)).toBeCloseTo(10, 3)
  })

  it("honors segments parameter", () => {
    const part = buildPart({
      shapeId: "c1",
      quantity: 1,
      shapeSpec: { kind: "circle", params: { diameter: 10, segments: 48 } },
      allowRotation: true,
    })
    expect(part.polygon).toHaveLength(48)
  })

  it("throws on zero diameter", () => {
    expect(() =>
      buildPart({
        shapeId: "c1",
        quantity: 1,
        shapeSpec: { kind: "circle", params: { diameter: 0 } },
        allowRotation: true,
      })
    ).toThrow(/diameter must be positive/i)
  })
})

describe("buildPart — trapezoid", () => {
  it("produces a 4-vertex CCW polygon with min-corner at (0,0)", () => {
    const part = buildPart({
      shapeId: "t1",
      quantity: 1,
      shapeSpec: {
        kind: "trapezoid",
        params: { topWidth: 6, bottomWidth: 10, height: 4 },
      },
      allowRotation: true,
    })
    expect(part.polygon).toHaveLength(4)
    const xs = part.polygon.map((p) => p.x)
    const ys = part.polygon.map((p) => p.y)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...xs)).toBeCloseTo(10, 6)
    expect(Math.max(...ys)).toBeCloseTo(4, 6)
  })

  it("throws on zero height", () => {
    expect(() =>
      buildPart({
        shapeId: "t1",
        quantity: 1,
        shapeSpec: {
          kind: "trapezoid",
          params: { topWidth: 6, bottomWidth: 10, height: 0 },
        },
        allowRotation: true,
      })
    ).toThrow(/height must be positive/i)
  })
})

describe("buildPart — sector (annular)", () => {
  it("produces polygon spanning outer diameter at y=0 through arc", () => {
    const part = buildPart({
      shapeId: "s1",
      quantity: 1,
      shapeSpec: {
        kind: "sector",
        params: { innerRadius: 2, outerRadius: 5, arcDegrees: 90 },
      },
      allowRotation: true,
    })
    expect(part.polygon.length).toBeGreaterThan(8)
    const xs = part.polygon.map((p) => p.x)
    const ys = part.polygon.map((p) => p.y)
    expect(Math.min(...xs)).toBeCloseTo(0, 3)
    expect(Math.min(...ys)).toBeCloseTo(0, 3)
  })
})

describe("buildPart — ngon (regular polygon)", () => {
  it("produces polygon with exactly N sides", () => {
    const part = buildPart({
      shapeId: "n1",
      quantity: 1,
      shapeSpec: { kind: "ngon", params: { sides: 6, radius: 5 } },
      allowRotation: true,
    })
    expect(part.polygon).toHaveLength(6)
  })

  it("throws for sides < 3", () => {
    expect(() =>
      buildPart({
        shapeId: "n1",
        quantity: 1,
        shapeSpec: { kind: "ngon", params: { sides: 2, radius: 5 } },
        allowRotation: true,
      })
    ).toThrow(/sides must be at least 3/i)
  })
})
