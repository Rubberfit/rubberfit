import { describe, it, expect } from "vitest"
import { buildPlacementView } from "@/src/application/packing/buildPlacementView"
import type { PackResult, Part } from "@/src/application/packing/types"

const PARTS: Part[] = [
  {
    shapeId: "rect-a",
    quantity: 1,
    polygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ],
    shapeSpec: { kind: "rect", params: { width: 10, height: 5 } },
    allowRotation: true,
  },
]

const RESULT: PackResult = {
  placements: [
    {
      shapeId: "rect-a",
      instanceIndex: 0,
      binId: "b1",
      x: 2,
      y: 3,
      rotationRad: 0,
      polygon: [
        { x: 2, y: 3 },
        { x: 12, y: 3 },
        { x: 12, y: 8 },
        { x: 2, y: 8 },
      ],
      width: 10,
      height: 5,
    },
  ],
  placedCount: 1,
  overflowCount: 0,
  perBin: [
    {
      binId: "b1",
      usedArea: 50,
      wasteArea: 0,
      occupiedWidth: 10,
      occupiedHeight: 5,
      efficiency: 1,
    },
  ],
  totalUsedArea: 50,
  totalWasteArea: 0,
}

describe("buildPlacementView", () => {
  it("joins placements to their source parts by shapeId", () => {
    const view = buildPlacementView(RESULT, PARTS)
    expect(view.items).toHaveLength(1)
    expect(view.items[0].shapeId).toBe("rect-a")
    expect(view.items[0].renderShape).toBe("rect")
  })

  it("carries shapeSpec onto view items for UI rendering", () => {
    const view = buildPlacementView(RESULT, PARTS)
    expect(view.items[0].shapeSpec).toEqual(PARTS[0].shapeSpec)
  })

  it("preserves placed polygon verbatim", () => {
    const view = buildPlacementView(RESULT, PARTS)
    expect(view.items[0].polygon).toEqual(RESULT.placements[0].polygon)
  })

  it("groups view items by binId", () => {
    const view = buildPlacementView(RESULT, PARTS)
    expect(view.bins["b1"]).toBeDefined()
    expect(view.bins["b1"].items).toHaveLength(1)
  })

  it("carries perBin metrics through", () => {
    const view = buildPlacementView(RESULT, PARTS)
    expect(view.bins["b1"].efficiency).toBe(1)
    expect(view.bins["b1"].usedArea).toBe(50)
  })
})
