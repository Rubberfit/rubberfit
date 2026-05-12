import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { JobPart } from "@/src/entities/job-part"
import { MaterialTypeId } from "@/src/entities/value-objects/id"

const MT_UUID = "00000000-0000-4000-8000-000000000020"

function makePart(overrides: Partial<Parameters<typeof JobPart.create>[0]> = {}) {
  return JobPart.create({
    lineNumber: 1,
    materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
    quantity: 2,
    ...overrides,
  })
}

describe("JobPart", () => {
  describe("create()", () => {
    it("constructs with required fields and nullable dimensions", () => {
      const p = makePart()
      expect(p.lineNumber).toBe(1)
      expect(p.quantity).toBe(2)
      expect(p.widthMm).toBeNull()
      expect(p.lengthMm).toBeNull()
      expect(p.thicknessMm).toBeNull()
      expect(p.description).toBeNull()
      expect(p.notes).toBeNull()
    })

    it("accepts full dimensions and trims optional strings", () => {
      const p = makePart({
        widthMm: 1370,
        lengthMm: 2000,
        thicknessMm: 0.085,
        description: "  vinyl panel  ",
        notes: "  fragile  ",
      })
      expect(p.widthMm).toBe(1370)
      expect(p.lengthMm).toBe(2000)
      expect(p.thicknessMm).toBe(0.085)
      expect(p.description).toBe("vinyl panel")
      expect(p.notes).toBe("fragile")
    })

    it("rejects non-positive integer lineNumber", () => {
      expect(() => makePart({ lineNumber: 0 })).toThrow(InvalidEntityError)
      expect(() => makePart({ lineNumber: -1 })).toThrow(InvalidEntityError)
      expect(() => makePart({ lineNumber: 1.5 })).toThrow(InvalidEntityError)
    })

    it("rejects non-positive integer quantity", () => {
      expect(() => makePart({ quantity: 0 })).toThrow(InvalidEntityError)
      expect(() => makePart({ quantity: -1 })).toThrow(InvalidEntityError)
      expect(() => makePart({ quantity: 1.5 })).toThrow(InvalidEntityError)
    })

    it("rejects non-positive integer dimensions if set", () => {
      expect(() => makePart({ widthMm: 0 })).toThrow(InvalidEntityError)
      expect(() => makePart({ lengthMm: -1 })).toThrow(InvalidEntityError)
      expect(() => makePart({ widthMm: 100.5 })).toThrow(InvalidEntityError)
    })

    it("rejects non-positive thicknessMm if set", () => {
      expect(() => makePart({ thicknessMm: 0 })).toThrow(InvalidEntityError)
      expect(() => makePart({ thicknessMm: -0.1 })).toThrow(InvalidEntityError)
    })

    it("accepts fractional thicknessMm", () => {
      expect(makePart({ thicknessMm: 0.085 }).thicknessMm).toBe(0.085)
    })
  })

  describe("equals", () => {
    it("compares all part fields", () => {
      expect(makePart().equals(makePart())).toBe(true)
      expect(makePart({ lineNumber: 1 }).equals(makePart({ lineNumber: 2 }))).toBe(false)
    })

    it("returns false for null", () => {
      expect(makePart().equals(null)).toBe(false)
    })
  })

  describe("fromSnapshot round-trip", () => {
    it("preserves all fields", () => {
      const p = makePart({
        widthMm: 1370,
        lengthMm: 2000,
        thicknessMm: 0.085,
        description: "vinyl",
        notes: "n",
      })
      const snap = p.toJSON()
      expect(JobPart.fromSnapshot(snap).toJSON()).toEqual(snap)
    })
  })
})
