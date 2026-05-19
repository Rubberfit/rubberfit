import { describe, expect, it } from "vitest"

import { InvalidValueObjectError } from "@/src/entities/errors/invalid-value-object.error"
import { TenantSlug } from "@/src/entities/value-objects/tenant-slug"

describe("TenantSlug", () => {
  describe("create()", () => {
    it.each([
      "ab",
      "acme",
      "acme-corp",
      "acme-corp-2025",
      "1-2-3",
      "a1b2c3",
      "a".repeat(100), // exactly the max
    ])("accepts valid slug: %s", (input) => {
      expect(TenantSlug.create(input).value).toBe(input)
    })

    it.each([
      ["empty", ""],
      ["single char", "a"], // below min length 2
      ["leading hyphen", "-acme"],
      ["trailing hyphen", "acme-"],
      ["uppercase", "AcmeCorp"],
      ["space", "acme corp"],
      ["underscore", "acme_corp"],
      ["dot", "acme.corp"],
      ["unicode", "acmé"],
    ])("rejects invalid slug: %s", (_label, input) => {
      expect(() => TenantSlug.create(input)).toThrow(InvalidValueObjectError)
    })

    it("rejects slugs longer than 100 characters", () => {
      expect(() => TenantSlug.create("a".repeat(101))).toThrow(
        InvalidValueObjectError,
      )
    })

    it("error message indicates length min/max as the failing rule", () => {
      try {
        TenantSlug.create("a")
        throw new Error("expected throw")
      } catch (err) {
        const e = err as InvalidValueObjectError
        expect(e.valueObject).toBe("TenantSlug")
        expect(e.reason).toMatch(/at least/)
      }
    })

    it("error message indicates format as the failing rule", () => {
      try {
        TenantSlug.create("Acme")
        throw new Error("expected throw")
      } catch (err) {
        const e = err as InvalidValueObjectError
        expect(e.reason).toMatch(/lowercase/)
      }
    })
  })

  describe("fromPersistence()", () => {
    it("trusts the DB value (no validation)", () => {
      // The DB CHECK enforces format; entity bypasses regex on rehydration.
      const s = TenantSlug.fromPersistence("Anything-The-DB-Has")
      expect(s.value).toBe("Anything-The-DB-Has")
    })
  })

  describe("equals()", () => {
    it("is true for same value", () => {
      expect(
        TenantSlug.create("acme").equals(TenantSlug.create("acme")),
      ).toBe(true)
    })

    it("is false for different value", () => {
      expect(
        TenantSlug.create("acme").equals(TenantSlug.create("acme-corp")),
      ).toBe(false)
    })

    it("is false for null/undefined", () => {
      const s = TenantSlug.create("acme")
      expect(s.equals(null)).toBe(false)
      expect(s.equals(undefined)).toBe(false)
    })
  })

  describe("serialization", () => {
    it("toJSON returns the raw string", () => {
      expect(JSON.stringify(TenantSlug.create("acme"))).toBe('"acme"')
    })
  })
})
