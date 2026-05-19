import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { ProjectMaterial } from "@/src/entities/project-material"
import { MaterialTypeId } from "@/src/entities/value-objects/id"

const MT_UUID = "00000000-0000-4000-8000-000000000020"

function makeMaterial(overrides: Partial<Parameters<typeof ProjectMaterial.create>[0]> = {}) {
  return ProjectMaterial.create({
    materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
    ...overrides,
  })
}

describe("ProjectMaterial", () => {
  describe("create()", () => {
    it("defaults requiredQuantitySqm to null and allocatedQuantitySqm to 0", () => {
      const m = makeMaterial()
      expect(m.materialTypeId.value).toBe(MT_UUID)
      expect(m.requiredQuantitySqm).toBeNull()
      expect(m.allocatedQuantitySqm).toBe(0)
      expect(m.notes).toBeNull()
      expect(m.isFullyAllocated).toBe(false)
    })

    it("accepts an explicit required + allocated quantity", () => {
      const m = makeMaterial({ requiredQuantitySqm: 12.5, allocatedQuantitySqm: 4 })
      expect(m.requiredQuantitySqm).toBe(12.5)
      expect(m.allocatedQuantitySqm).toBe(4)
      expect(m.isFullyAllocated).toBe(false)
    })

    it("isFullyAllocated true once allocation meets required", () => {
      const m = makeMaterial({ requiredQuantitySqm: 10, allocatedQuantitySqm: 10 })
      expect(m.isFullyAllocated).toBe(true)
    })

    it("rejects negative requiredQuantitySqm", () => {
      expect(() => makeMaterial({ requiredQuantitySqm: -1 })).toThrow(InvalidEntityError)
    })

    it("rejects negative allocatedQuantitySqm", () => {
      expect(() => makeMaterial({ allocatedQuantitySqm: -1 })).toThrow(InvalidEntityError)
    })

    it("rejects non-finite values", () => {
      expect(() => makeMaterial({ requiredQuantitySqm: Number.POSITIVE_INFINITY })).toThrow(
        InvalidEntityError
      )
      expect(() => makeMaterial({ allocatedQuantitySqm: Number.NaN })).toThrow(InvalidEntityError)
    })

    it("trims optional notes", () => {
      const m = makeMaterial({ notes: "  hold  " })
      expect(m.notes).toBe("hold")
    })
  })

  describe("functional updates", () => {
    it("withAllocation replaces the allocated quantity", () => {
      const m = makeMaterial({ allocatedQuantitySqm: 2 })
      const next = m.withAllocation(7)
      expect(next).not.toBe(m)
      expect(next.allocatedQuantitySqm).toBe(7)
      expect(m.allocatedQuantitySqm).toBe(2)
    })

    it("withAllocation rejects negative", () => {
      const m = makeMaterial()
      expect(() => m.withAllocation(-1)).toThrow(InvalidEntityError)
    })

    it("withAdditionalAllocation adds a delta", () => {
      const m = makeMaterial({ allocatedQuantitySqm: 4 })
      expect(m.withAdditionalAllocation(2).allocatedQuantitySqm).toBe(6)
    })

    it("withAdditionalAllocation accepts a negative delta as long as result stays >= 0", () => {
      const m = makeMaterial({ allocatedQuantitySqm: 4 })
      expect(m.withAdditionalAllocation(-3).allocatedQuantitySqm).toBe(1)
    })

    it("withAdditionalAllocation rejects a delta that would go below zero", () => {
      const m = makeMaterial({ allocatedQuantitySqm: 1 })
      expect(() => m.withAdditionalAllocation(-5)).toThrow(InvalidEntityError)
    })

    it("withAdditionalAllocation rejects non-finite delta", () => {
      const m = makeMaterial()
      expect(() => m.withAdditionalAllocation(Number.POSITIVE_INFINITY)).toThrow(InvalidEntityError)
      expect(() => m.withAdditionalAllocation(Number.NaN)).toThrow(InvalidEntityError)
    })

    it("withRequired updates the requirement (incl. null)", () => {
      const m = makeMaterial({ requiredQuantitySqm: 5 })
      expect(m.withRequired(10).requiredQuantitySqm).toBe(10)
      expect(m.withRequired(null).requiredQuantitySqm).toBeNull()
    })

    it("withRequired rejects negative", () => {
      const m = makeMaterial()
      expect(() => m.withRequired(-1)).toThrow(InvalidEntityError)
    })

    it("withNotes trims and accepts null", () => {
      const m = makeMaterial({ notes: "x" })
      expect(m.withNotes("  y  ").notes).toBe("y")
      expect(m.withNotes(null).notes).toBeNull()
    })
  })

  describe("equals", () => {
    it("compares all material fields", () => {
      expect(
        makeMaterial({ allocatedQuantitySqm: 4 }).equals(makeMaterial({ allocatedQuantitySqm: 4 }))
      ).toBe(true)
      expect(
        makeMaterial({ allocatedQuantitySqm: 4 }).equals(makeMaterial({ allocatedQuantitySqm: 5 }))
      ).toBe(false)
    })
  })

  describe("fromSnapshot round-trip", () => {
    it("preserves all fields", () => {
      const m = makeMaterial({
        requiredQuantitySqm: 12,
        allocatedQuantitySqm: 4,
        notes: "n",
      })
      const snap = m.toJSON()
      expect(ProjectMaterial.fromSnapshot(snap).toJSON()).toEqual(snap)
    })
  })
})
