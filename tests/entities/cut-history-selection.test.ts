import { describe, expect, it } from "vitest"

import { CutHistorySelection } from "@/src/entities/cut-history-selection"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"

describe("CutHistorySelection", () => {
  describe("create()", () => {
    it("constructs with required selectionIndex and null defaults", () => {
      const s = CutHistorySelection.create({ selectionIndex: 0 })
      expect(s.selectionIndex).toBe(0)
      expect(s.sizeValue).toBeNull()
      expect(s.sizeText).toBeNull()
      expect(s.label).toBeNull()
    })

    it("trims sizeText and label", () => {
      const s = CutHistorySelection.create({
        selectionIndex: 1,
        sizeText: "  12x14  ",
        label: "  Door Panel  ",
      })
      expect(s.sizeText).toBe("12x14")
      expect(s.label).toBe("Door Panel")
    })

    it("rejects negative selectionIndex", () => {
      expect(() => CutHistorySelection.create({ selectionIndex: -1 })).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects non-integer selectionIndex", () => {
      expect(() =>
        CutHistorySelection.create({ selectionIndex: 1.5 }),
      ).toThrow(InvalidEntityError)
    })

    it("rejects non-integer sizeValue", () => {
      expect(() =>
        CutHistorySelection.create({ selectionIndex: 0, sizeValue: 1.5 }),
      ).toThrow(InvalidEntityError)
    })

    it.each([
      ["sizeText", "x".repeat(201)],
      ["label", "x".repeat(201)],
    ])("rejects overlong %s", (field, value) => {
      expect(() =>
        CutHistorySelection.create({
          selectionIndex: 0,
          [field]: value,
        }),
      ).toThrow(InvalidEntityError)
    })

    it("empty / whitespace strings become null", () => {
      const s = CutHistorySelection.create({
        selectionIndex: 0,
        sizeText: "",
        label: "   ",
      })
      expect(s.sizeText).toBeNull()
      expect(s.label).toBeNull()
    })
  })

  describe("equals()", () => {
    it("true when all fields match", () => {
      const a = CutHistorySelection.create({
        selectionIndex: 0,
        sizeValue: 12,
        sizeText: "12x14",
        label: "A",
      })
      const b = CutHistorySelection.create({
        selectionIndex: 0,
        sizeValue: 12,
        sizeText: "12x14",
        label: "A",
      })
      expect(a.equals(b)).toBe(true)
    })

    it("false on any field mismatch", () => {
      const a = CutHistorySelection.create({
        selectionIndex: 0,
        label: "A",
      })
      const b = CutHistorySelection.create({
        selectionIndex: 0,
        label: "B",
      })
      expect(a.equals(b)).toBe(false)
    })

    it("false on null / undefined", () => {
      const a = CutHistorySelection.create({ selectionIndex: 0 })
      expect(a.equals(null)).toBe(false)
      expect(a.equals(undefined)).toBe(false)
    })
  })

  describe("toJSON / fromSnapshot round-trip", () => {
    it("preserves all fields", () => {
      const a = CutHistorySelection.create({
        selectionIndex: 2,
        sizeValue: 168,
        sizeText: "12x14",
        label: "Door",
      })
      const snap = a.toJSON()
      expect(CutHistorySelection.fromSnapshot(snap).toJSON()).toEqual(snap)
    })
  })
})
