import { describe, expect, it } from "vitest"
import { templateToPart } from "@/app/dashboard/cutting-engine/_components/template-to-part"
import type { PartTemplate } from "@/app/dashboard/cutting-engine/_components/preset-template-data"

describe("templateToPart for partType=polygon", () => {
  const triangle: PartTemplate = {
    id: "dxf-1",
    partType: "polygon",
    label: "tri.dxf",
    summary: "DXF: tri.dxf",
    quantity: 2,
    category: "custom",
    polygon: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 3 },
    ],
    isCustom: true,
  }

  it("yields a Part with polygon set, shapeSpec undefined, ≥3 vertices", () => {
    const part = templateToPart(triangle, "T")
    expect(part).not.toBeNull()
    if (!part) return
    expect(part.shapeSpec).toBeUndefined()
    expect(part.polygon).toBeDefined()
    expect(part.polygon!.length).toBeGreaterThanOrEqual(3)
    expect(part.tag).toBe("T")
    expect(part.quantity).toBe(2)
    expect(part.allowRotation).toBe(true)
  })

  it("normalises winding to CCW (positive shoelace area in math coords)", () => {
    const part = templateToPart(triangle, undefined)
    expect(part).not.toBeNull()
    if (!part || !part.polygon) return
    let signed = 0
    for (let i = 0; i < part.polygon.length; i++) {
      const a = part.polygon[i]
      const b = part.polygon[(i + 1) % part.polygon.length]
      signed += a.x * b.y - b.x * a.y
    }
    // CCW in standard math coords ⇒ positive shoelace.
    expect(signed).toBeGreaterThan(0)
  })

  it("returns null for fewer than 3 vertices", () => {
    const degenerate: PartTemplate = {
      ...triangle,
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    }
    expect(templateToPart(degenerate, undefined)).toBeNull()
  })

  it("returns null when polygon is undefined", () => {
    const missing: PartTemplate = { ...triangle, polygon: undefined }
    expect(templateToPart(missing, undefined)).toBeNull()
  })
})
