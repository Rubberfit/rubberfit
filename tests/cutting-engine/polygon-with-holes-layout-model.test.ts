// PR 0b — `LayoutModel.PlacedPart` carries a sibling `holes?: Point2D[][]`
// alongside the outer-ring `polygon`. This pins:
//   1. The wire round-trip from `PackResult.placements[].polygon`
//      (a `PolygonWithHoles`) to `PlacedPart` preserves both fields
//      with no flattening.
//   2. The tolerant load path (`coercePlacedPart`) accepts holes on a
//      versioned `cut_history.layout_json` row, drops degenerate rings
//      (< 3 vertices), and treats a missing `holes` field as no holes.
//   3. The strict guard (`isLayoutModel`) accepts both shapes —
//      no-holes (back-compat) and with-holes (the new shape).

import { describe, expect, it } from "vitest"

import {
  coerceLayoutModel,
  isLayoutModel,
} from "@/app/dashboard/cutting-engine/_components/layout-model"
import { packResultToLayoutModel } from "@/app/dashboard/cutting-engine/_components/pack-result-to-layout-model"
import type { PartTemplate } from "@/app/dashboard/cutting-engine/_components/preset-template-data"
import type { PackRequest, PackResult } from "@/src/application/packing/types"
import { assertNotNull } from "../_helpers/assert-not-null"

const RING_TEMPLATE: PartTemplate = {
  id: "ring-12-8",
  partType: "rectangle",
  label: "Ring 12 OD / 8 ID",
  summary: "annulus",
  quantity: 1,
  category: "custom",
  renderShape: "ring",
}

const SHEET_BIN = {
  binId: "b1",
  width: 48,
  height: 96,
  kind: "fresh" as const,
}

const RING_REQUEST: PackRequest = {
  bins: [SHEET_BIN],
  clearance: 0.125,
  items: [
    {
      shapeId: RING_TEMPLATE.id,
      quantity: 1,
      polygon: {
        outer: [
          { x: 0, y: 0 },
          { x: 12, y: 0 },
          { x: 12, y: 12 },
          { x: 0, y: 12 },
        ],
        holes: [
          [
            { x: 4, y: 4 },
            { x: 8, y: 4 },
            { x: 8, y: 8 },
            { x: 4, y: 8 },
          ],
        ],
      },
      allowRotation: true,
    },
  ],
}

const RING_RESULT: PackResult = {
  placements: [
    {
      shapeId: RING_TEMPLATE.id,
      instanceIndex: 0,
      binId: SHEET_BIN.binId,
      x: 1,
      y: 1,
      rotationRad: 0,
      polygon: {
        outer: [
          { x: 1, y: 1 },
          { x: 13, y: 1 },
          { x: 13, y: 13 },
          { x: 1, y: 13 },
        ],
        holes: [
          [
            { x: 5, y: 5 },
            { x: 9, y: 5 },
            { x: 9, y: 9 },
            { x: 5, y: 9 },
          ],
        ],
      },
      width: 12,
      height: 12,
    },
  ],
  placedCount: 1,
  overflowCount: 0,
  perBin: [
    {
      binId: SHEET_BIN.binId,
      usedArea: 144 - 16,
      wasteArea: SHEET_BIN.width * SHEET_BIN.height - (144 - 16),
      occupiedWidth: 12,
      occupiedHeight: 12,
      efficiency: 0.028,
      scrapRatio: 0.972,
      freeRegions: [],
      offcuts: [],
    },
  ],
  totalUsedArea: 144 - 16,
  totalWasteArea: SHEET_BIN.width * SHEET_BIN.height - (144 - 16),
  overallDensity: 0.028,
}

describe("PR 0b — PlacedPart carries sibling holes alongside polygon", () => {
  describe("packResultToLayoutModel adapter", () => {
    it("preserves the outer ring on `polygon` and the inner loops on `holes`", () => {
      const layouts = packResultToLayoutModel(RING_RESULT, RING_REQUEST, [RING_TEMPLATE])
      expect(layouts).toHaveLength(1)
      const placed = layouts[0].parts[0]
      expect(placed.polygon).toHaveLength(4)
      expect(placed.polygon?.[0]).toEqual({ x: 1, y: 1 })
      expect(placed.holes).toHaveLength(1)
      expect(placed.holes?.[0]).toHaveLength(4)
      expect(placed.holes?.[0][0]).toEqual({ x: 5, y: 5 })
    })

    it("omits `holes` (undefined) when the placement has no holes", () => {
      const noHoleResult: PackResult = {
        ...RING_RESULT,
        placements: [
          {
            ...RING_RESULT.placements[0],
            polygon: { outer: RING_RESULT.placements[0].polygon.outer, holes: [] },
          },
        ],
      }
      const layouts = packResultToLayoutModel(noHoleResult, RING_REQUEST, [RING_TEMPLATE])
      expect(layouts[0].parts[0].holes).toBeUndefined()
    })
  })

  describe("coercePlacedPart (tolerant load)", () => {
    const VALID_LAYOUT = {
      sheetWidth: 48,
      sheetLength: 96,
      parts: [
        {
          id: "p1",
          shapeId: "ring",
          label: "A",
          renderShape: "polygon",
          specIndex: 0,
          x: 1,
          y: 1,
          rotationRad: 0,
          width: 12,
          height: 12,
          polygon: [
            { x: 1, y: 1 },
            { x: 13, y: 1 },
            { x: 13, y: 13 },
            { x: 1, y: 13 },
          ],
          holes: [
            [
              { x: 5, y: 5 },
              { x: 9, y: 5 },
              { x: 9, y: 9 },
              { x: 5, y: 9 },
            ],
          ],
        },
      ],
      offcuts: [],
      scrap: [],
      placedCount: 1,
      overflowCount: 0,
      usedAreaSqFt: 0.9,
      reusableAreaSqFt: 0,
      scrapAreaSqFt: 31.1,
      fabScore: 0.028,
      source: "rust-rf-layout",
    }

    it("loads a layout with holes on a placed part", () => {
      const coerced = coerceLayoutModel(VALID_LAYOUT)
      expect(coerced).not.toBeNull()
      assertNotNull(coerced)
      const holes = coerced.parts[0].holes
      assertNotNull(holes)
      expect(holes).toHaveLength(1)
      expect(holes[0]).toHaveLength(4)
    })

    it("treats missing `holes` as no holes (backward compat with v1 rows)", () => {
      const v1Row = {
        ...VALID_LAYOUT,
        parts: [{ ...VALID_LAYOUT.parts[0], holes: undefined }],
      }
      const coerced = coerceLayoutModel(v1Row)
      assertNotNull(coerced)
      expect(coerced.parts[0].holes).toBeUndefined()
    })

    it("drops degenerate hole rings (< 3 vertices) instead of rejecting the whole part", () => {
      const partial = {
        ...VALID_LAYOUT,
        parts: [
          {
            ...VALID_LAYOUT.parts[0],
            holes: [
              [
                { x: 5, y: 5 },
                { x: 9, y: 5 },
                { x: 9, y: 9 },
              ],
              // degenerate two-vertex ring — coercer drops it
              [
                { x: 1, y: 1 },
                { x: 2, y: 2 },
              ],
              // garbage entry — coercer skips it
              "not-a-ring",
            ],
          },
        ],
      }
      const coerced = coerceLayoutModel(partial)
      expect(coerced).not.toBeNull()
      assertNotNull(coerced)
      expect(coerced.parts[0].holes).toHaveLength(1)
    })
  })

  describe("strict guard (isLayoutModel)", () => {
    it("accepts a layout with holes", () => {
      const layouts = packResultToLayoutModel(RING_RESULT, RING_REQUEST, [RING_TEMPLATE])
      expect(isLayoutModel(layouts[0])).toBe(true)
    })

    it("accepts a layout without holes (back-compat)", () => {
      const noHoleResult: PackResult = {
        ...RING_RESULT,
        placements: [
          {
            ...RING_RESULT.placements[0],
            polygon: { outer: RING_RESULT.placements[0].polygon.outer, holes: [] },
          },
        ],
      }
      const layouts = packResultToLayoutModel(noHoleResult, RING_REQUEST, [RING_TEMPLATE])
      expect(isLayoutModel(layouts[0])).toBe(true)
    })
  })
})
