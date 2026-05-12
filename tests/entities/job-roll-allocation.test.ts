import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { JobRollAllocation } from "@/src/entities/job-roll-allocation"
import { RollId } from "@/src/entities/value-objects/id"

const ROLL_UUID = "00000000-0000-4000-8000-000000000200"

function makeAllocation(overrides: Partial<Parameters<typeof JobRollAllocation.create>[0]> = {}) {
  return JobRollAllocation.create({
    rollId: RollId.fromPersistence(ROLL_UUID),
    allocatedLengthMm: 1500,
    ...overrides,
  })
}

describe("JobRollAllocation", () => {
  describe("create()", () => {
    it("constructs with required fields", () => {
      const a = makeAllocation()
      expect(a.rollId.value).toBe(ROLL_UUID)
      expect(a.allocatedLengthMm).toBe(1500)
      expect(a.notes).toBeNull()
    })

    it("trims optional notes", () => {
      expect(makeAllocation({ notes: "  reserve A  " }).notes).toBe("reserve A")
    })

    it("rejects non-positive integer allocatedLengthMm", () => {
      expect(() => makeAllocation({ allocatedLengthMm: 0 })).toThrow(InvalidEntityError)
      expect(() => makeAllocation({ allocatedLengthMm: -1 })).toThrow(InvalidEntityError)
      expect(() => makeAllocation({ allocatedLengthMm: 1.5 })).toThrow(InvalidEntityError)
    })
  })

  describe("equals", () => {
    it("returns true for identical fields", () => {
      expect(makeAllocation().equals(makeAllocation())).toBe(true)
    })

    it("returns false for differing length", () => {
      expect(
        makeAllocation({ allocatedLengthMm: 1500 }).equals(
          makeAllocation({ allocatedLengthMm: 2000 })
        )
      ).toBe(false)
    })

    it("returns false for null / undefined", () => {
      expect(makeAllocation().equals(null)).toBe(false)
      expect(makeAllocation().equals(undefined)).toBe(false)
    })
  })

  describe("fromSnapshot round-trip", () => {
    it("preserves all fields", () => {
      const a = makeAllocation({ allocatedLengthMm: 3000, notes: "for cut 2" })
      const snap = a.toJSON()
      expect(JobRollAllocation.fromSnapshot(snap).toJSON()).toEqual(snap)
    })
  })
})
