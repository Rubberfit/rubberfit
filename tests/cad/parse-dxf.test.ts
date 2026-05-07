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

  it("narrows ARC / CIRCLE / SPLINE / ELLIPSE into UnsupportedEntity", () => {
    const cases: Array<{ name: string; type: string }> = [
      { name: "arc", type: "ARC" },
      { name: "circle", type: "CIRCLE" },
      { name: "spline", type: "SPLINE" },
      { name: "ellipse", type: "ELLIPSE" },
    ]
    for (const { type } of cases) {
      const text = synthesise(type)
      const doc = parseDxf(text)
      expect(doc.entities).toHaveLength(1)
      const entity = doc.entities[0]
      expect(entity.kind).toBe("unsupported")
      if (entity.kind !== "unsupported") continue
      expect(entity.originalType).toBe(type)
      expect(entity.reason).toBe("curves-deferred-to-pr2")
    }
  })

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

function synthesise(type: string): string {
  const bodies: Record<string, string[]> = {
    ARC: [
      "  0",
      "ARC",
      "  8",
      "0",
      " 10",
      "0.0",
      " 20",
      "0.0",
      " 40",
      "5.0",
      " 50",
      "0.0",
      " 51",
      "90.0",
    ],
    CIRCLE: ["  0", "CIRCLE", "  8", "0", " 10", "0.0", " 20", "0.0", " 40", "5.0"],
    SPLINE: ["  0", "SPLINE", "  8", "0", " 70", "8", " 71", "3"],
    ELLIPSE: [
      "  0",
      "ELLIPSE",
      "  8",
      "0",
      " 10",
      "0.0",
      " 20",
      "0.0",
      " 11",
      "5.0",
      " 21",
      "0.0",
      " 40",
      "0.5",
      " 41",
      "0.0",
      " 42",
      "6.28",
    ],
  }
  const body = bodies[type] ?? []
  return ["  0", "SECTION", "  2", "ENTITIES", ...body, "  0", "ENDSEC", "  0", "EOF", ""].join(
    "\n"
  )
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
