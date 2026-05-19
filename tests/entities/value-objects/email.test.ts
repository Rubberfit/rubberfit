import { describe, expect, it } from "vitest"

import { InvalidValueObjectError } from "@/src/entities/errors/invalid-value-object.error"
import { Email } from "@/src/entities/value-objects/email"

describe("Email", () => {
  describe("create()", () => {
    it("constructs from a valid address", () => {
      const e = Email.create("user@example.com")
      expect(e.value).toBe("user@example.com")
    })

    it("trims surrounding whitespace", () => {
      const e = Email.create("  user@example.com  ")
      expect(e.value).toBe("user@example.com")
    })

    it("preserves case (does not lowercase)", () => {
      const e = Email.create("User.Name@Example.COM")
      expect(e.value).toBe("User.Name@Example.COM")
    })

    it.each([
      "user+tag@example.com",
      "user.name@example.co.uk",
      "u_n@e-x.io",
      "123@example.org",
      "x.y%z@example.com",
    ])("accepts conventional address: %s", (input) => {
      expect(() => Email.create(input)).not.toThrow()
    })

    it.each([
      ["empty", ""],
      ["whitespace only", "   "],
      ["no @", "userexample.com"],
      ["no local part", "@example.com"],
      ["no domain", "user@"],
      ["no TLD", "user@example"],
      ["space in local part", "us er@example.com"],
      ["double @", "user@@example.com"],
    ])("rejects malformed input: %s", (_label, input) => {
      expect(() => Email.create(input)).toThrow(InvalidValueObjectError)
    })

    it("rejects values exceeding 320 characters", () => {
      const local = "a".repeat(310)
      const tooLong = `${local}@x.io` // 318 + 5 = >320? actually 318 chars... let me build a clean one
      const definitelyTooLong = `${"a".repeat(315)}@x.io` // 315 + 5 = 320 still ok... use larger
      const reallyTooLong = `${"a".repeat(316)}@x.io` // 316 + 5 = 321 — over the limit
      expect(() => Email.create(definitelyTooLong)).not.toThrow()
      expect(() => Email.create(reallyTooLong)).toThrow(InvalidValueObjectError)
      // Suppress unused var lint
      void tooLong
    })

    it("includes the VO label and the input on validation errors", () => {
      try {
        Email.create("bad")
        throw new Error("expected throw")
      } catch (err) {
        const e = err as InvalidValueObjectError
        expect(e.valueObject).toBe("Email")
        expect(e.receivedValue).toBe("bad")
        expect(e.code).toBe("INVALID_VALUE_OBJECT")
      }
    })
  })

  describe("fromPersistence()", () => {
    it("trusts the DB value (no validation)", () => {
      const e = Email.fromPersistence("not-validated@here")
      expect(e.value).toBe("not-validated@here")
    })
  })

  describe("equals()", () => {
    it("is true for same value", () => {
      expect(
        Email.create("a@b.com").equals(Email.create("a@b.com")),
      ).toBe(true)
    })

    it("is case-sensitive on raw value (use toLowercase() before comparing for case-insensitive)", () => {
      expect(
        Email.create("A@b.com").equals(Email.create("a@b.com")),
      ).toBe(false)
    })

    it("is false for null/undefined", () => {
      const e = Email.create("a@b.com")
      expect(e.equals(null)).toBe(false)
      expect(e.equals(undefined)).toBe(false)
    })
  })

  describe("toLowercase()", () => {
    it("returns a new lowercased Email instance", () => {
      const original = Email.create("User@Example.COM")
      const lower = original.toLowercase()
      expect(lower.value).toBe("user@example.com")
      expect(original.value).toBe("User@Example.COM") // immutable
    })

    it("makes equals() symmetric across cases", () => {
      const a = Email.create("A@B.com").toLowercase()
      const b = Email.create("a@b.COM").toLowercase()
      expect(a.equals(b)).toBe(true)
    })
  })

  describe("domain getter", () => {
    it("returns the part after @", () => {
      expect(Email.create("user@example.com").domain).toBe("example.com")
    })

    it("works for multi-dot TLDs", () => {
      expect(Email.create("user@a.b.example.co.uk").domain).toBe(
        "a.b.example.co.uk",
      )
    })

    it("works after fromPersistence (no validation path)", () => {
      expect(Email.fromPersistence("x@y.z").domain).toBe("y.z")
    })
  })

  describe("serialization", () => {
    it("toString() returns the raw value", () => {
      expect(Email.create("a@b.com").toString()).toBe("a@b.com")
    })

    it("JSON.stringify produces a bare string", () => {
      expect(JSON.stringify(Email.create("a@b.com"))).toBe('"a@b.com"')
    })
  })
})
