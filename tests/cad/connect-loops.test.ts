import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseDxf } from "@/src/application/cad/parse-dxf"
import { connectLoops, pickDefaultLayer } from "@/src/application/cad/connect-loops"

function fixture(name: string): string {
  return readFileSync(resolve("tests/fixtures/dxf", `${name}.dxf`), "utf8")
}

describe("connectLoops with curves", () => {
  it("CIRCLE entity produces one closed loop tessellated to >=16 vertices", () => {
    const doc = parseDxf(fixture("ring-gasket"))
    const layer = pickDefaultLayer(doc)
    const { loops } = connectLoops(doc, layer)
    expect(loops.length).toBe(2) // outer + inner
    expect(loops[0].length).toBeGreaterThanOrEqual(16)
  })

  it("SPLINE closed entity produces one closed loop", () => {
    const doc = parseDxf(fixture("spline-profile"))
    const layer = pickDefaultLayer(doc)
    const { loops } = connectLoops(doc, layer)
    expect(loops.length).toBe(1)
  })

  it("ARC + LINE chain forms a closed loop via endpoint-snap", () => {
    const doc = parseDxf(fixture("arc-chain"))
    const layer = pickDefaultLayer(doc)
    const { loops } = connectLoops(doc, layer)
    expect(loops.length).toBe(1)
    // Rounded rect: 4 line midpoints + arcs at 4 corners — well over 8 verts.
    expect(loops[0].length).toBeGreaterThan(8)
  })

  it("LWPOLYLINE with bulge becomes a single tessellated loop", () => {
    const doc = parseDxf(fixture("lwpolyline-with-bulge"))
    const layer = pickDefaultLayer(doc)
    const { loops, rejected } = connectLoops(doc, layer)
    expect(loops.length).toBe(1)
    expect(rejected).toHaveLength(0)
  })

  it("ELLIPSE full sweep produces one closed loop", () => {
    const doc = parseDxf(fixture("ellipse-gasket"))
    const layer = pickDefaultLayer(doc)
    const { loops } = connectLoops(doc, layer)
    // 1 ellipse + 1 inner circle = 2 loops
    expect(loops.length).toBe(2)
  })
})

describe("connectLoops (PR1 regression coverage)", () => {
  it("returns a single closed loop for a closed LWPOLYLINE", () => {
    const doc = parseDxf(fixture("rectangle"))
    const layer = pickDefaultLayer(doc)
    const result = connectLoops(doc, layer)
    expect(result.loops).toHaveLength(1)
    expect(result.loops[0]).toHaveLength(4)
    expect(result.rejected).toHaveLength(0)
  })

  it("returns a single closed loop for a closed POLYLINE", () => {
    const doc = parseDxf(fixture("bracket-polyline-inch"))
    const layer = pickDefaultLayer(doc)
    const result = connectLoops(doc, layer)
    expect(result.loops).toHaveLength(1)
    expect(result.loops[0]).toHaveLength(6)
  })

  it("returns two loops for two disjoint LWPOLYLINEs (multi-part rejection input)", () => {
    const doc = parseDxf(fixture("two-rectangles"))
    const layer = pickDefaultLayer(doc)
    const result = connectLoops(doc, layer)
    expect(result.loops).toHaveLength(2)
  })

  it("assembles a chain of LINE segments into one closed loop when endpoints match", () => {
    const text = [
      "  0",
      "SECTION",
      "  2",
      "ENTITIES",
      "  0",
      "LINE",
      "  8",
      "0",
      " 10",
      "0",
      " 20",
      "0",
      " 11",
      "10",
      " 21",
      "0",
      "  0",
      "LINE",
      "  8",
      "0",
      " 10",
      "10",
      " 20",
      "0",
      " 11",
      "10",
      " 21",
      "10",
      "  0",
      "LINE",
      "  8",
      "0",
      " 10",
      "10",
      " 20",
      "10",
      " 11",
      "0",
      " 21",
      "10",
      "  0",
      "LINE",
      "  8",
      "0",
      " 10",
      "0",
      " 20",
      "10",
      " 11",
      "0",
      " 21",
      "0",
      "  0",
      "ENDSEC",
      "  0",
      "EOF",
      "",
    ].join("\n")
    const doc = parseDxf(text)
    const result = connectLoops(doc, "0")
    expect(result.loops).toHaveLength(1)
    expect(result.loops[0]).toHaveLength(4)
  })

  it("returns zero loops when LINE chain does not close", () => {
    const text = [
      "  0",
      "SECTION",
      "  2",
      "ENTITIES",
      "  0",
      "LINE",
      "  8",
      "0",
      " 10",
      "0",
      " 20",
      "0",
      " 11",
      "10",
      " 21",
      "0",
      "  0",
      "LINE",
      "  8",
      "0",
      " 10",
      "10",
      " 20",
      "0",
      " 11",
      "10",
      " 21",
      "10",
      "  0",
      "ENDSEC",
      "  0",
      "EOF",
      "",
    ].join("\n")
    const doc = parseDxf(text)
    const result = connectLoops(doc, "0")
    expect(result.loops).toHaveLength(0)
  })
})
