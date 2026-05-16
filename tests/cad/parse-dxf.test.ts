import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseDxf } from "@/src/application/cad/parse-dxf"

function fixture(name: string): string {
  return readFileSync(resolve("tests/fixtures/dxf", `${name}.dxf`), "utf8")
}

describe("parseDxf", () => {
  it("round-trips a closed LWPOLYLINE rectangle (mm)", () => {
    const doc = parseDxf(fixture("rectangle"))
    expect(doc.insUnits).toBe(4)
    expect(doc.entities).toHaveLength(1)
    const entity = doc.entities[0]
    expect(entity.kind).toBe("lwpolyline")
    if (entity.kind !== "lwpolyline") return
    expect(entity.layer).toBe("0")
    expect(entity.closed).toBe(true)
    expect(entity.vertices).toHaveLength(4)
    expect(entity.vertices.every((v) => v.bulge === 0)).toBe(true)
  })

  it("round-trips a closed POLYLINE bracket (inch)", () => {
    const doc = parseDxf(fixture("bracket-polyline-inch"))
    expect(doc.insUnits).toBe(1)
    expect(doc.entities).toHaveLength(1)
    const entity = doc.entities[0]
    expect(entity.kind).toBe("polyline")
    if (entity.kind !== "polyline") return
    expect(entity.closed).toBe(true)
    expect(entity.vertices).toHaveLength(6)
  })

  it("preserves bulge values on LWPOLYLINE vertices", () => {
    const doc = parseDxf(fixture("lwpolyline-with-bulge"))
    expect(doc.entities).toHaveLength(1)
    const entity = doc.entities[0]
    expect(entity.kind).toBe("lwpolyline")
    if (entity.kind !== "lwpolyline") return
    expect(entity.vertices[0].bulge).toBe(0.5)
    expect(entity.vertices.slice(1).every((v) => v.bulge === 0)).toBe(true)
  })

  it("returns insUnits=undefined when $INSUNITS header is missing", () => {
    const doc = parseDxf(fixture("no-insunits"))
    expect(doc.insUnits).toBeUndefined()
  })

  it("narrows ARC entity with center + radius + angles (degrees)", () => {
    const doc = parseDxf(fixture("arc-chain"))
    const arc = doc.entities.find((e) => e.kind === "arc")
    expect(arc).toBeDefined()
    if (arc?.kind !== "arc") throw new Error("expected arc")
    expect(arc.center).toBeDefined()
    expect(arc.radius).toBeGreaterThan(0)
    expect(arc.startAngleDeg).toBeGreaterThanOrEqual(0)
    expect(arc.endAngleDeg).toBeGreaterThan(arc.startAngleDeg)
  })

  it("narrows CIRCLE entity", () => {
    const doc = parseDxf(fixture("ring-gasket"))
    const circles = doc.entities.filter((e) => e.kind === "circle")
    expect(circles).toHaveLength(2)
    // Outer + inner both at origin.
    for (const c of circles) {
      if (c.kind !== "circle") continue
      expect(c.center).toEqual({ x: 0, y: 0 })
      expect(c.radius).toBeGreaterThan(0)
    }
  })

  it("narrows SPLINE entity with knots, degree, and closed flag", () => {
    const doc = parseDxf(fixture("spline-profile"))
    const spline = doc.entities.find((e) => e.kind === "spline")
    expect(spline).toBeDefined()
    if (spline?.kind !== "spline") throw new Error("expected spline")
    expect(spline.degree).toBeGreaterThan(0)
    expect(spline.controlPoints.length).toBeGreaterThanOrEqual(spline.degree + 1)
    expect(spline.knots.length).toBeGreaterThanOrEqual(spline.controlPoints.length + spline.degree + 1)
    expect(spline.closed).toBe(true)
  })

  it("narrows ELLIPSE entity with major axis end and params", () => {
    const doc = parseDxf(fixture("ellipse-gasket"))
    const ellipse = doc.entities.find((e) => e.kind === "ellipse")
    expect(ellipse).toBeDefined()
    if (ellipse?.kind !== "ellipse") throw new Error("expected ellipse")
    expect(ellipse.center).toEqual({ x: 0, y: 0 })
    expect(ellipse.majorAxisEnd.x).toBeCloseTo(6.0)
    expect(ellipse.axisRatio).toBeCloseTo(0.5)
    expect(ellipse.endParam).toBeCloseTo(2 * Math.PI)
  })

  it("preserves bulge values on LWPOLYLINE vertices (no longer rejected)", () => {
    const doc = parseDxf(fixture("lwpolyline-with-bulge"))
    const lwp = doc.entities.find((e) => e.kind === "lwpolyline")
    expect(lwp).toBeDefined()
    if (lwp?.kind !== "lwpolyline") throw new Error("expected lwpolyline")
    expect(lwp.vertices.some((v) => v.bulge !== 0)).toBe(true)
  })

  it("rejects malformed SPLINE (truncated knot vector) with reason spline-malformed", () => {
    const text = malformedSpline()
    const doc = parseDxf(text)
    const entity = doc.entities[0]
    expect(entity.kind).toBe("unsupported")
    if (entity.kind !== "unsupported") return
    expect(entity.originalType).toBe("SPLINE")
    expect(entity.reason).toBe("spline-malformed")
  })

  // Rational-spline rejection: deferred. dxf-parser's `ISplineEntity` does
  // not expose per-control-point weights, so we can't author a fixture that
  // narrowing recognises as rational without round-tripping the bit-4 flag.
  // The flag itself is honoured by `narrowSpline` (entity.rational === true
  // returns "spline-rational-not-supported"); integration coverage in Task 5
  // exercises that path.
  it.todo("rejects rational SPLINE (non-unit weights) with reason spline-rational-not-supported")

  it("narrows POLYLINE flag variants (curve-fit, spline-fit, 3D, 3D-mesh, polyface) into UnsupportedEntity", () => {
    const flagCases: Array<{ flag: number; reason: string }> = [
      { flag: 2, reason: "polyline-curve-fit" },
      { flag: 4, reason: "polyline-spline-fit" },
      { flag: 8, reason: "polyline-3d" },
      { flag: 16, reason: "polyline-3d-mesh" },
      { flag: 64, reason: "polyline-polyface-mesh" },
    ]
    for (const { flag, reason } of flagCases) {
      const text = polylineWithFlag(flag)
      const doc = parseDxf(text)
      const entity = doc.entities[0]
      expect(entity.kind).toBe("unsupported")
      if (entity.kind !== "unsupported") continue
      expect(entity.reason).toBe(reason)
    }
  })
})

function malformedSpline(): string {
  // Degree 3, 4 control points, but only 4 knot values (need >= 4 + 3 + 1 = 8).
  return [
    "  0",
    "SECTION",
    "  2",
    "ENTITIES",
    "  0",
    "SPLINE",
    "  8",
    "0",
    " 70",
    "8",
    " 71",
    "3",
    " 72",
    "4",
    " 73",
    "4",
    " 40",
    "0.0",
    " 40",
    "0.0",
    " 40",
    "1.0",
    " 40",
    "1.0",
    " 10",
    "0.0",
    " 20",
    "0.0",
    " 10",
    "1.0",
    " 20",
    "0.0",
    " 10",
    "2.0",
    " 20",
    "1.0",
    " 10",
    "3.0",
    " 20",
    "0.0",
    "  0",
    "ENDSEC",
    "  0",
    "EOF",
    "",
  ].join("\n")
}

function polylineWithFlag(flag: number): string {
  // group 70 = closed (1) | the variant flag we want to test
  const flag70 = (1 | flag).toString()
  return [
    "  0",
    "SECTION",
    "  2",
    "ENTITIES",
    "  0",
    "POLYLINE",
    "  8",
    "0",
    " 66",
    "1",
    " 10",
    "0.0",
    " 20",
    "0.0",
    " 30",
    "0.0",
    " 70",
    flag70,
    "  0",
    "VERTEX",
    "  8",
    "0",
    " 10",
    "0.0",
    " 20",
    "0.0",
    " 30",
    "0.0",
    "  0",
    "VERTEX",
    "  8",
    "0",
    " 10",
    "1.0",
    " 20",
    "0.0",
    " 30",
    "0.0",
    "  0",
    "VERTEX",
    "  8",
    "0",
    " 10",
    "1.0",
    " 20",
    "1.0",
    " 30",
    "0.0",
    "  0",
    "SEQEND",
    "  0",
    "ENDSEC",
    "  0",
    "EOF",
    "",
  ].join("\n")
}
