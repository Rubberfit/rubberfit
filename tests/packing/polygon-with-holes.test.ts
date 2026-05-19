// tests/packing/polygon-with-holes.test.ts
import { describe, expect, it } from "vitest"
import { packRequestSchema } from "@/src/application/packing/types"

describe("PolygonWithHoles wire contract", () => {
  const baseFixture = {
    bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
    clearance: 0.125,
  }

  it("accepts legacy single-loop polygon array on a Part", () => {
    const result = packRequestSchema.safeParse({
      ...baseFixture,
      items: [
        {
          shapeId: "rect-a",
          quantity: 1,
          polygon: [
            { x: 0, y: 0 },
            { x: 24, y: 0 },
            { x: 24, y: 12 },
            { x: 0, y: 12 },
          ],
          allowRotation: true,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    const part = result.data.items[0]
    expect(part.polygon).toBeDefined()
    expect(part.polygon?.outer).toHaveLength(4)
    expect(part.polygon?.holes).toEqual([])
  })

  it("accepts structured polygon-with-holes on a Part", () => {
    const result = packRequestSchema.safeParse({
      ...baseFixture,
      items: [
        {
          shapeId: "ring",
          quantity: 1,
          polygon: {
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
          },
          allowRotation: true,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    const part = result.data.items[0]
    expect(part.polygon?.outer).toHaveLength(4)
    expect(part.polygon?.holes).toHaveLength(1)
    expect(part.polygon?.holes[0]).toHaveLength(4)
  })

  it("rejects a polygon shape with fewer than 3 outer vertices", () => {
    const result = packRequestSchema.safeParse({
      ...baseFixture,
      items: [
        {
          shapeId: "bad",
          quantity: 1,
          polygon: {
            outer: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
            ],
            holes: [],
          },
          allowRotation: true,
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a hole with fewer than 3 vertices", () => {
    // Outer-ring min(3) is already covered above; this locks the
    // same constraint on each individual hole ring.
    const result = packRequestSchema.safeParse({
      ...baseFixture,
      items: [
        {
          shapeId: "ring-bad-hole",
          quantity: 1,
          polygon: {
            outer: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
              { x: 0, y: 10 },
            ],
            holes: [[{ x: 3, y: 3 }, { x: 7, y: 3 }]],
          },
          allowRotation: true,
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("treats a missing holes field as no holes", () => {
    const result = packRequestSchema.safeParse({
      ...baseFixture,
      items: [
        {
          shapeId: "ring",
          quantity: 1,
          polygon: {
            outer: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
            ],
          },
          allowRotation: true,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.items[0].polygon?.holes).toEqual([])
  })
})
