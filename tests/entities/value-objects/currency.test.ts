import { describe, expect, it } from "vitest"

import { InvalidValueObjectError } from "@/src/entities/errors/invalid-value-object.error"
import { Currency } from "@/src/entities/value-objects/currency"

describe("Currency", () => {
  describe("create()", () => {
    it.each(["USD", "EUR", "GBP", "CAD", "JPY", "AUD"])(
      "accepts valid ISO-4217 code: %s",
      (code) => {
        expect(Currency.create(code).value).toBe(code)
      },
    )

    it("uppercases lowercase input", () => {
      expect(Currency.create("usd").value).toBe("USD")
    })

    it("uppercases mixed-case input", () => {
      expect(Currency.create("uSd").value).toBe("USD")
    })

    it.each([
      ["empty", ""],
      ["one char", "U"],
      ["two chars", "US"],
      ["four chars", "USDX"],
      ["digits", "123"],
      ["mixed alphanumeric", "US1"],
      ["non-ASCII", "EÜR"],
    ])("rejects invalid format: %s", (_label, input) => {
      expect(() => Currency.create(input)).toThrow(InvalidValueObjectError)
    })

    it("error has correct VO label", () => {
      try {
        Currency.create("X")
        throw new Error("expected throw")
      } catch (err) {
        const e = err as InvalidValueObjectError
        expect(e.valueObject).toBe("Currency")
        expect(e.code).toBe("INVALID_VALUE_OBJECT")
      }
    })
  })

  describe("fromPersistence()", () => {
    it("trusts the DB value (no validation)", () => {
      // Skip format check on rehydration
      expect(Currency.fromPersistence("xyz").value).toBe("xyz")
    })
  })

  describe("equals()", () => {
    it("is true for same value", () => {
      expect(Currency.create("USD").equals(Currency.create("USD"))).toBe(true)
    })

    it("is true after case normalization", () => {
      expect(Currency.create("usd").equals(Currency.create("USD"))).toBe(true)
    })

    it("is false for different value", () => {
      expect(Currency.create("USD").equals(Currency.create("EUR"))).toBe(false)
    })

    it("is false for null/undefined", () => {
      const c = Currency.create("USD")
      expect(c.equals(null)).toBe(false)
      expect(c.equals(undefined)).toBe(false)
    })
  })

  describe("serialization", () => {
    it("toString returns the code", () => {
      expect(Currency.create("USD").toString()).toBe("USD")
    })

    it("JSON.stringify produces a bare string", () => {
      expect(JSON.stringify(Currency.create("EUR"))).toBe('"EUR"')
    })
  })
})
