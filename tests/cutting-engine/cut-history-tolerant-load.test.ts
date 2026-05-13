// Cut-history regression: every PR that adds or tightens a field on
// `LayoutModel` was silently invalidating cuts saved by previous
// shapes. The strict `isLayoutModelArray` guard would reject the
// entire blob when one optional field's check failed, and
// `extractFrozenLayouts` returned `null` — the visualizer then
// rendered a blank sheet for cuts that DID have valid geometry.
//
// These tests pin the new tolerant `coerceLayoutModelArray` behavior:
//   A. Old shape with newer fields missing — still loads, defaults
//      back-filled.
//   B. Wrong-type optional field (e.g., `null` instead of undefined) —
//      coerced away, parent layout still loads.
//   C. Missing required sheet dimensions — coercer correctly returns
//      null (irrecoverable).
//   D. Mixed valid + invalid layouts — drops bad ones, keeps good ones.
//   E. Unknown `source` — falls back to "rust-rf-layout".

import { describe, expect, it } from "vitest"

import {
  coerceLayoutModel,
  coerceLayoutModelArray,
} from "@/app/dashboard/cutting-engine/_components/layout-model"

const MINIMAL_RECT_PART = {
  id: "p1",
  shapeId: "rect-spec-0",
  label: "P1",
  renderShape: "rect",
  specIndex: 0,
  x: 0,
  y: 0,
  rotationRad: 0,
  width: 12,
  height: 8,
}

const VALID_LAYOUT = {
  sheetWidth: 48,
  sheetLength: 96,
  parts: [MINIMAL_RECT_PART],
  offcuts: [],
  scrap: [],
  placedCount: 1,
  overflowCount: 0,
  usedAreaSqFt: 0.667,
  reusableAreaSqFt: 0,
  scrapAreaSqFt: 31.333,
  fabScore: 0.021,
  source: "rust-rf-layout",
}

describe("coerceLayoutModel — tolerant load for cut_history.layout_json", () => {
  it("A. Loads a layout that was saved before optional fields existed", () => {
    // Simulate a pre-tightening save: the new optional fields
    // (`packPolygon`, `sheetKind`, `parentSheetIndex`,
    // `debugScrapRects`) were not yet in the schema. Every
    // load-bearing field is present.
    const old = { ...VALID_LAYOUT }
    const coerced = coerceLayoutModel(old)
    expect(coerced).not.toBeNull()
    expect(coerced!.sheetWidth).toBe(48)
    expect(coerced!.parts).toHaveLength(1)
    expect(coerced!.parts[0].id).toBe("p1")
    // Newly-introduced optional fields default to undefined, not null.
    expect(coerced!.sheetKind).toBeUndefined()
    expect(coerced!.parentSheetIndex).toBeUndefined()
    expect(coerced!.debugScrapRects).toBeUndefined()
  })

  it("B. Coerces wrong-type optional fields away instead of rejecting the whole layout", () => {
    // `null` instead of `undefined` was the silent killer — the strict
    // guard's `=== undefined ||` check failed, then the type guard
    // failed, and the entire layout was rejected.
    const wrongTypes = {
      ...VALID_LAYOUT,
      parentSheetIndex: null,
      debugScrapRects: null,
      parts: [
        {
          ...MINIMAL_RECT_PART,
          packPolygon: null, // pre-tightening save shape
          flipped: null,
          rotated90: "yes", // garbage value
        },
      ],
    }
    const coerced = coerceLayoutModel(wrongTypes)
    expect(coerced).not.toBeNull()
    expect(coerced!.parts).toHaveLength(1)
    expect(coerced!.parts[0].packPolygon).toBeUndefined()
    expect(coerced!.parts[0].flipped).toBeUndefined()
    expect(coerced!.parts[0].rotated90).toBeUndefined()
    expect(coerced!.parentSheetIndex).toBeUndefined()
  })

  it("C. Returns null when sheet dimensions are missing (irrecoverable)", () => {
    expect(coerceLayoutModel({ ...VALID_LAYOUT, sheetWidth: undefined })).toBeNull()
    expect(coerceLayoutModel({ ...VALID_LAYOUT, sheetLength: "bad" })).toBeNull()
    expect(coerceLayoutModel(null)).toBeNull()
    expect(coerceLayoutModel("not an object")).toBeNull()
  })

  it("D. coerceLayoutModelArray drops irrecoverable layouts but keeps the good ones", () => {
    const mixed = [
      VALID_LAYOUT,
      { sheetWidth: undefined }, // irrecoverable
      { ...VALID_LAYOUT, source: "unknown-engine" }, // fallback to rust-rf-layout
    ]
    const layouts = coerceLayoutModelArray(mixed)
    expect(layouts).not.toBeNull()
    expect(layouts).toHaveLength(2)
    // Bad source falls back to rust-rf-layout instead of failing.
    expect(layouts![1].source).toBe("rust-rf-layout")
  })

  it("E. Empty / non-array input returns null", () => {
    expect(coerceLayoutModelArray([])).toBeNull()
    expect(coerceLayoutModelArray(null)).toBeNull()
    expect(coerceLayoutModelArray({})).toBeNull()
  })

  it("F. Drops malformed parts without dropping the parent layout", () => {
    const partialParts = {
      ...VALID_LAYOUT,
      parts: [
        MINIMAL_RECT_PART,
        { id: "garbage", x: "not a number" }, // dropped
        { ...MINIMAL_RECT_PART, id: "p2", x: 12 },
      ],
    }
    const coerced = coerceLayoutModel(partialParts)
    expect(coerced).not.toBeNull()
    expect(coerced!.parts).toHaveLength(2)
    expect(coerced!.parts.map((p) => p.id)).toEqual(["p1", "p2"])
  })
})
