import { describe, expect, it } from "vitest"

import {
  gasketSpecToPartTemplate,
  type GasketSpec,
} from "@/src/application/gasket/gasket-template"

describe("gasketSpecToPartTemplate", () => {
  it("ring → partType polygon, 1 hole, bbox = OD × OD", () => {
    const spec: GasketSpec = { kind: "ring", outerDiameter: 12, innerDiameter: 8 }
    const tmpl = gasketSpecToPartTemplate(spec)
    expect(tmpl.partType).toBe("polygon")
    expect(tmpl.width).toBeCloseTo(12, 4)
    expect(tmpl.length).toBeCloseTo(12, 4)
    expect(tmpl.polygon?.holes).toHaveLength(1)
    expect(tmpl.summary).toBe("Ring")
    expect(tmpl.label).toBe("Ring · OD 12″ ID 8″")
    expect(tmpl.renderShape).toBe("polygon")
    expect(tmpl.isCustom).toBe(true)
  })

  it("full-face → bbox = OD, holes = 1 + boltCount, label includes spec dims", () => {
    const spec: GasketSpec = {
      kind: "full-face",
      outerDiameter: 16,
      boreInnerDiameter: 8,
      boltCircleDiameter: 12,
      boltCount: 8,
      boltHoleDiameter: 0.75,
    }
    const tmpl = gasketSpecToPartTemplate(spec)
    expect(tmpl.partType).toBe("polygon")
    expect(tmpl.width).toBeCloseTo(16, 4)
    expect(tmpl.length).toBeCloseTo(16, 4)
    expect(tmpl.polygon?.holes).toHaveLength(9)
    expect(tmpl.summary).toBe("Full-face")
    expect(tmpl.label).toBe("Full-face · OD 16″ 8×0.75″")
  })

  it("obround → bbox = (length, width), no holes", () => {
    const spec: GasketSpec = { kind: "obround", length: 6, width: 3 }
    const tmpl = gasketSpecToPartTemplate(spec)
    expect(tmpl.partType).toBe("polygon")
    expect(tmpl.width).toBeCloseTo(6, 4)
    expect(tmpl.length).toBeCloseTo(3, 4)
    expect(tmpl.polygon?.holes).toHaveLength(0)
    expect(tmpl.summary).toBe("Obround")
    expect(tmpl.label).toBe("Obround · 6″ × 3″")
  })

  it("polygon outer is centered at origin (origin-anchored bbox)", () => {
    const tmpl = gasketSpecToPartTemplate({
      kind: "ring",
      outerDiameter: 10,
      innerDiameter: 6,
    })
    const xs = tmpl.polygon!.outer.map((p) => p.x)
    const ys = tmpl.polygon!.outer.map((p) => p.y)
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(0, 4)
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(0, 4)
  })

  it("label drops trailing zeros (12″, not 12.000″)", () => {
    const tmpl = gasketSpecToPartTemplate({
      kind: "ring",
      outerDiameter: 12.5,
      innerDiameter: 8,
    })
    expect(tmpl.label).toBe("Ring · OD 12.5″ ID 8″")
  })

  it("propagates the underlying primitive throw (Ring: ID >= OD)", () => {
    expect(() =>
      gasketSpecToPartTemplate({ kind: "ring", outerDiameter: 8, innerDiameter: 8 })
    ).toThrow()
  })

  it("propagates the underlying primitive throw (Full-face: boltCount out of range)", () => {
    expect(() =>
      gasketSpecToPartTemplate({
        kind: "full-face",
        outerDiameter: 16,
        boreInnerDiameter: 8,
        boltCircleDiameter: 12,
        boltCount: 100,
        boltHoleDiameter: 0.5,
      })
    ).toThrow()
  })
})
