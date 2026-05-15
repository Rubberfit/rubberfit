import { describe, it, expect } from "vitest"
import { buildPlacementView } from "@/src/application/packing/buildPlacementView"
import { buildPackRequest } from "@/src/application/packing/buildPackRequest"
import type { PackResult, Part } from "@/src/application/packing/types"

const PARTS: Part[] = [
  {
    shapeId: "rect-a",
    quantity: 1,
    polygon: {
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 0, y: 5 },
      ],
      holes: [],
    },
    shapeSpec: { kind: "rect", params: { width: 10, height: 5 } },
    allowRotation: true,
  },
]

const PACK_REQUEST = buildPackRequest({
  bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
  items: PARTS,
  clearance: 0.125,
})

const RESULT: PackResult = {
  placements: [
    {
      shapeId: "rect-a",
      instanceIndex: 0,
      binId: "b1",
      x: 2,
      y: 3,
      rotationRad: 0,
      polygon: {
        outer: [
          { x: 2, y: 3 },
          { x: 12, y: 3 },
          { x: 12, y: 8 },
          { x: 2, y: 8 },
        ],
        holes: [],
      },
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
      scrapRatio: 0,
      freeRegions: [],
      offcuts: [],
    },
  ],
  totalUsedArea: 50,
  totalWasteArea: 0,
  overallDensity: 1,
}

describe("buildPlacementView", () => {
  it("joins placements to their source parts by shapeId", () => {
    const view = buildPlacementView(RESULT, PACK_REQUEST)
    expect(view.items).toHaveLength(1)
    expect(view.items[0].shapeId).toBe("rect-a")
    expect(view.items[0].renderShape).toBe("rect")
  })

  it("carries shapeSpec onto view items for UI rendering", () => {
    const view = buildPlacementView(RESULT, PACK_REQUEST)
    expect(view.items[0].shapeSpec).toEqual(PARTS[0].shapeSpec)
  })

  it("preserves placed polygon outer ring verbatim (PR 0a: view is single-contour today)", () => {
    const view = buildPlacementView(RESULT, PACK_REQUEST)
    expect(view.items[0].polygon).toEqual(RESULT.placements[0].polygon.outer)
  })

  it("drops holes at the view boundary (PR 0a: PR 0b lifts view to PolygonWithHoles)", () => {
    // Regression guard for the deliberate boundary adapter behavior:
    // a holed Placement renders into the legacy view as outer-only.
    // When PR 0b lifts `PlacementViewItem.polygon` to PolygonWithHoles,
    // this test should be updated/removed and the assertion flipped.
    const holedResult: PackResult = {
      ...RESULT,
      placements: [
        {
          ...RESULT.placements[0],
          polygon: {
            outer: RESULT.placements[0].polygon.outer,
            holes: [
              [
                { x: 4, y: 4 },
                { x: 10, y: 4 },
                { x: 10, y: 7 },
                { x: 4, y: 7 },
              ],
            ],
          },
        },
      ],
    }
    const view = buildPlacementView(holedResult, PACK_REQUEST)
    expect(view.items[0].polygon).toEqual(holedResult.placements[0].polygon.outer)
    expect(view.items[0].polygon).not.toContainEqual({ x: 4, y: 4 })
  })

  it("groups view items by binId", () => {
    const view = buildPlacementView(RESULT, PACK_REQUEST)
    expect(view.bins["b1"]).toBeDefined()
    expect(view.bins["b1"].items).toHaveLength(1)
  })

  it("carries perBin metrics through", () => {
    const view = buildPlacementView(RESULT, PACK_REQUEST)
    expect(view.bins["b1"].efficiency).toBe(1)
    expect(view.bins["b1"].usedArea).toBe(50)
  })

  it("bin dimensions are carried from PackRequest.bins", () => {
    const view = buildPlacementView(RESULT, PACK_REQUEST)
    expect(view.bins["b1"].width).toBe(48)
    expect(view.bins["b1"].height).toBe(96)
  })

  it("routes placements to correct bin with multi-bin result", () => {
    const twoBinRequest = buildPackRequest({
      bins: [
        { binId: "b1", width: 48, height: 96, kind: "fresh" },
        { binId: "b2", width: 48, height: 96, kind: "fresh" },
      ],
      items: PARTS,
      clearance: 0.125,
    })
    const twoBinResult: PackResult = {
      ...RESULT,
      placements: [
        { ...RESULT.placements[0], binId: "b1", instanceIndex: 0 },
        { ...RESULT.placements[0], binId: "b2", instanceIndex: 1 },
      ],
      placedCount: 2,
      perBin: [
        { ...RESULT.perBin[0], binId: "b1" },
        { ...RESULT.perBin[0], binId: "b2" },
      ],
    }
    const view = buildPlacementView(twoBinResult, twoBinRequest)
    expect(view.bins["b1"].items).toHaveLength(1)
    expect(view.bins["b2"].items).toHaveLength(1)
    expect(Object.keys(view.bins)).toHaveLength(2)
  })

  it("placement without matching part does not throw and falls back to polygon", () => {
    const orphanResult: PackResult = {
      ...RESULT,
      placements: [{ ...RESULT.placements[0], shapeId: "unknown-id" }],
    }
    const view = buildPlacementView(orphanResult, PACK_REQUEST)
    expect(view.items[0].shapeSpec).toBeUndefined()
    expect(view.items[0].renderShape).toBe("polygon")
  })

  it("falls back to polygon for dxf/svg/custom shape kinds", () => {
    const kinds: Array<"dxf" | "svg" | "custom"> = ["dxf", "svg", "custom"]
    for (const kind of kinds) {
      const parts: Part[] = [
        {
          shapeId: "any",
          quantity: 1,
          polygon: {
            outer: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 1 },
            ],
            holes: [],
          },
          shapeSpec: { kind, params: {} },
          allowRotation: true,
        },
      ]
      const req = buildPackRequest({
        bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
        items: parts,
        clearance: 0.125,
      })
      const result: PackResult = {
        ...RESULT,
        placements: [{ ...RESULT.placements[0], shapeId: "any" }],
      }
      const view = buildPlacementView(result, req)
      expect(view.items[0].renderShape).toBe("polygon")
    }
  })
})
