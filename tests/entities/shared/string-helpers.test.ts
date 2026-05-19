import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import {
  trimOptional,
  trimRequired,
} from "@/src/entities/shared/string-helpers"

describe("trimRequired()", () => {
  it("trims and returns the value", () => {
    expect(trimRequired("  hello  ", "field", 50, "Test")).toBe("hello")
  })

  it("returns input unchanged when no surrounding whitespace", () => {
    expect(trimRequired("hello", "field", 50, "Test")).toBe("hello")
  })

  it("rejects empty string", () => {
    expect(() => trimRequired("", "field", 50, "Test")).toThrow(
      InvalidEntityError,
    )
  })

  it("rejects whitespace-only", () => {
    expect(() => trimRequired("   ", "field", 50, "Test")).toThrow(
      InvalidEntityError,
    )
  })

  it("rejects when length exceeds max (after trim)", () => {
    expect(() => trimRequired("x".repeat(51), "field", 50, "Test")).toThrow(
      InvalidEntityError,
    )
  })

  it("accepts at exactly max length", () => {
    expect(trimRequired("x".repeat(50), "field", 50, "Test")).toBe(
      "x".repeat(50),
    )
  })

  it("error tags the supplied entityName", () => {
    try {
      trimRequired("", "myField", 10, "Address")
    } catch (err) {
      const e = err as InvalidEntityError
      expect(e.entity).toBe("Address")
      expect(e.message).toContain("myField")
    }
  })

  it("error message includes the field name on length violation", () => {
    try {
      trimRequired("x".repeat(11), "addressLine1", 10, "Address")
    } catch (err) {
      expect((err as InvalidEntityError).message).toContain("addressLine1")
    }
  })
})

describe("trimOptional()", () => {
  describe("null/undefined/empty handling", () => {
    it("null → null", () => {
      expect(trimOptional(null, "field", 50, "Test")).toBeNull()
    })

    it("undefined → null", () => {
      expect(trimOptional(undefined, "field", 50, "Test")).toBeNull()
    })

    it("empty string → null", () => {
      expect(trimOptional("", "field", 50, "Test")).toBeNull()
    })

    it("whitespace-only → null", () => {
      expect(trimOptional("   ", "field", 50, "Test")).toBeNull()
    })
  })

  describe("non-empty values", () => {
    it("trims surrounding whitespace", () => {
      expect(trimOptional("  hello  ", "field", 50, "Test")).toBe("hello")
    })

    it("returns input unchanged when no whitespace", () => {
      expect(trimOptional("hello", "field", 50, "Test")).toBe("hello")
    })
  })

  describe("length validation", () => {
    it("rejects when length exceeds max", () => {
      expect(() =>
        trimOptional("x".repeat(51), "field", 50, "Test"),
      ).toThrow(InvalidEntityError)
    })

    it("accepts at exactly max length", () => {
      expect(trimOptional("x".repeat(50), "field", 50, "Test")).toBe(
        "x".repeat(50),
      )
    })

    it("max=null skips length check (unbounded text)", () => {
      const veryLong = "x".repeat(100000)
      expect(() => trimOptional(veryLong, "notes", null, "Test")).not.toThrow()
    })

    it("max=null still trims and treats empty as null", () => {
      expect(trimOptional("  ", "notes", null, "Test")).toBeNull()
      expect(trimOptional("  trimmed  ", "notes", null, "Test")).toBe(
        "trimmed",
      )
    })
  })

  describe("error metadata", () => {
    it("error tags supplied entityName + field", () => {
      try {
        trimOptional("x".repeat(31), "phone", 30, "Person")
      } catch (err) {
        const e = err as InvalidEntityError
        expect(e.entity).toBe("Person")
        expect(e.message).toContain("phone")
      }
    })
  })
})
