import { describe, expect, it } from "vitest"
import { detectUnits } from "@/src/application/cad/detect-units"
import type { DxfDocument } from "@/src/application/cad/dxf-types"

function docWith(insUnits: number | undefined): DxfDocument {
  return { insUnits, entities: [] }
}

describe("detectUnits", () => {
  it("returns 'inch' for $INSUNITS=1", () => {
    expect(detectUnits(docWith(1))).toBe("inch")
  })

  it("returns 'mm' for $INSUNITS=4", () => {
    expect(detectUnits(docWith(4))).toBe("mm")
  })

  it("returns undefined for $INSUNITS=0 (unitless)", () => {
    expect(detectUnits(docWith(0))).toBeUndefined()
  })

  it("returns undefined when $INSUNITS header is missing", () => {
    expect(detectUnits(docWith(undefined))).toBeUndefined()
  })

  it("returns undefined for unrecognised codes (feet, meters, etc.)", () => {
    expect(detectUnits(docWith(2))).toBeUndefined()
    expect(detectUnits(docWith(6))).toBeUndefined()
  })
})
