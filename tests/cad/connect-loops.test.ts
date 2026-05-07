import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseDxf } from "@/src/application/cad/parse-dxf"
import { connectLoops, pickDefaultLayer } from "@/src/application/cad/connect-loops"

function fixture(name: string): string {
  return readFileSync(resolve("tests/fixtures/dxf", `${name}.dxf`), "utf8")
}

describe("connectLoops", () => {
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

  it("rejects an LWPOLYLINE with a nonzero bulge with reason polyline-contains-bulge", () => {
    const doc = parseDxf(fixture("lwpolyline-with-bulge"))
    const layer = pickDefaultLayer(doc)
    const result = connectLoops(doc, layer)
    expect(result.loops).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toBe("polyline-contains-bulge")
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
