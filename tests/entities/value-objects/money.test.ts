import { describe, expect, it } from "vitest"

import { InvalidValueObjectError } from "@/src/entities/errors/invalid-value-object.error"
import { Currency } from "@/src/entities/value-objects/currency"
import { Money } from "@/src/entities/value-objects/money"

const USD = Currency.create("USD")
const EUR = Currency.create("EUR")

describe("Money", () => {
  describe("fromCents()", () => {
    it("constructs from integer cents and currency", () => {
      const m = Money.fromCents(1000, USD)
      expect(m.cents).toBe(1000)
      expect(m.currency.value).toBe("USD")
    })

    it("accepts negative cents (refunds, adjustments)", () => {
      expect(() => Money.fromCents(-500, USD)).not.toThrow()
    })

    it("accepts zero", () => {
      expect(Money.fromCents(0, USD).isZero).toBe(true)
    })

    it.each([
      ["fractional cents", 1.5],
      ["NaN", Number.NaN],
      ["string disguised as number", "100" as unknown as number],
      ["just over MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER + 1],
    ])("rejects invalid cents: %s", (_label, input) => {
      expect(() => Money.fromCents(input, USD)).toThrow(
        InvalidValueObjectError,
      )
    })

    it("accepts MAX_SAFE_INTEGER and rejects beyond", () => {
      expect(() => Money.fromCents(Number.MAX_SAFE_INTEGER, USD)).not.toThrow()
      expect(() =>
        Money.fromCents(Number.MAX_SAFE_INTEGER + 1, USD),
      ).toThrow(InvalidValueObjectError)
    })
  })

  describe("zero() / fromPersistence() / fromSnapshot()", () => {
    it("zero(currency) = $0 in that currency", () => {
      const m = Money.zero(USD)
      expect(m.cents).toBe(0)
      expect(m.currency.value).toBe("USD")
    })

    it("fromPersistence() trusts DB cents (no integer check)", () => {
      // Real DB rows are always integers, but the VO doesn't assert that.
      const m = Money.fromPersistence(2500, "EUR")
      expect(m.cents).toBe(2500)
      expect(m.currency.value).toBe("EUR")
    })

    it("fromSnapshot() round-trips toJSON output", () => {
      const original = Money.fromCents(1234, USD)
      const snapshot = original.toJSON()
      const rehydrated = Money.fromSnapshot(snapshot)
      expect(rehydrated.equals(original)).toBe(true)
    })
  })

  describe("arithmetic — same currency", () => {
    it("add", () => {
      const a = Money.fromCents(1000, USD)
      const b = Money.fromCents(500, USD)
      expect(a.add(b).cents).toBe(1500)
    })

    it("subtract", () => {
      const a = Money.fromCents(1000, USD)
      const b = Money.fromCents(300, USD)
      expect(a.subtract(b).cents).toBe(700)
    })

    it("subtract can produce negative result", () => {
      const a = Money.fromCents(100, USD)
      const b = Money.fromCents(500, USD)
      const result = a.subtract(b)
      expect(result.cents).toBe(-400)
      expect(result.isNegative).toBe(true)
    })

    it("multiply by integer", () => {
      expect(Money.fromCents(100, USD).multiply(3).cents).toBe(300)
    })

    it("multiply by fractional rounds to integer cents", () => {
      // 100 cents * 0.075 = 7.5 → 8 (Math.round half-away-from-zero)
      expect(Money.fromCents(100, USD).multiply(0.075).cents).toBe(8)
    })

    it("multiply by zero", () => {
      expect(Money.fromCents(1000, USD).multiply(0).cents).toBe(0)
    })

    it("multiply rejects non-finite scalar", () => {
      expect(() => Money.fromCents(100, USD).multiply(Number.NaN)).toThrow(
        InvalidValueObjectError,
      )
      expect(() =>
        Money.fromCents(100, USD).multiply(Number.POSITIVE_INFINITY),
      ).toThrow(InvalidValueObjectError)
    })
  })

  describe("arithmetic — cross-currency throws", () => {
    it("add throws on mismatch", () => {
      expect(() =>
        Money.fromCents(100, USD).add(Money.fromCents(50, EUR)),
      ).toThrow(InvalidValueObjectError)
    })

    it("subtract throws on mismatch", () => {
      expect(() =>
        Money.fromCents(100, USD).subtract(Money.fromCents(50, EUR)),
      ).toThrow(InvalidValueObjectError)
    })

    it("compare throws on mismatch", () => {
      expect(() =>
        Money.fromCents(100, USD).compare(Money.fromCents(100, EUR)),
      ).toThrow(InvalidValueObjectError)
    })

    it("error message names both currencies", () => {
      try {
        Money.fromCents(1, USD).add(Money.fromCents(1, EUR))
        throw new Error("expected throw")
      } catch (err) {
        const e = err as InvalidValueObjectError
        expect(e.message).toContain("USD")
        expect(e.message).toContain("EUR")
      }
    })
  })

  describe("compare()", () => {
    it("returns -1 when this < other", () => {
      expect(Money.fromCents(100, USD).compare(Money.fromCents(200, USD))).toBe(
        -1,
      )
    })

    it("returns 0 when equal", () => {
      expect(Money.fromCents(100, USD).compare(Money.fromCents(100, USD))).toBe(
        0,
      )
    })

    it("returns 1 when this > other", () => {
      expect(Money.fromCents(200, USD).compare(Money.fromCents(100, USD))).toBe(
        1,
      )
    })
  })

  describe("equals()", () => {
    it("true for same cents + currency", () => {
      expect(
        Money.fromCents(100, USD).equals(Money.fromCents(100, USD)),
      ).toBe(true)
    })

    it("false on cents mismatch (no throw)", () => {
      expect(
        Money.fromCents(100, USD).equals(Money.fromCents(101, USD)),
      ).toBe(false)
    })

    it("false on currency mismatch — does NOT throw (unlike arithmetic)", () => {
      // equals is the safe comparator; doesn't throw on mixed currency
      expect(() =>
        Money.fromCents(100, USD).equals(Money.fromCents(100, EUR)),
      ).not.toThrow()
      expect(
        Money.fromCents(100, USD).equals(Money.fromCents(100, EUR)),
      ).toBe(false)
    })

    it("false for null/undefined", () => {
      const m = Money.fromCents(100, USD)
      expect(m.equals(null)).toBe(false)
      expect(m.equals(undefined)).toBe(false)
    })
  })

  describe("predicates", () => {
    it("isZero / isPositive / isNegative are mutually exclusive", () => {
      const zero = Money.fromCents(0, USD)
      const pos = Money.fromCents(1, USD)
      const neg = Money.fromCents(-1, USD)
      expect([zero.isZero, zero.isPositive, zero.isNegative]).toEqual([
        true,
        false,
        false,
      ])
      expect([pos.isZero, pos.isPositive, pos.isNegative]).toEqual([
        false,
        true,
        false,
      ])
      expect([neg.isZero, neg.isPositive, neg.isNegative]).toEqual([
        false,
        false,
        true,
      ])
    })
  })

  describe("conversions", () => {
    it("toCents returns the raw cents value", () => {
      expect(Money.fromCents(1234, USD).toCents()).toBe(1234)
    })

    it("toMajorUnits returns cents/100", () => {
      expect(Money.fromCents(1234, USD).toMajorUnits()).toBe(12.34)
    })

    it("toMajorUnits handles zero", () => {
      expect(Money.zero(USD).toMajorUnits()).toBe(0)
    })
  })

  describe("serialization", () => {
    it("toString is debug-friendly: 'CCC NNN'", () => {
      expect(Money.fromCents(1000, USD).toString()).toBe("USD 1000")
    })

    it("toJSON emits structured {cents, currency}", () => {
      const m = Money.fromCents(1000, USD)
      expect(m.toJSON()).toEqual({ cents: 1000, currency: "USD" })
    })

    it("JSON.stringify uses the structured shape", () => {
      const m = Money.fromCents(500, EUR)
      expect(JSON.stringify(m)).toBe('{"cents":500,"currency":"EUR"}')
    })
  })

  describe("immutability", () => {
    it("arithmetic returns new instances; original unchanged", () => {
      const a = Money.fromCents(100, USD)
      const b = a.add(Money.fromCents(50, USD))
      expect(a.cents).toBe(100) // unchanged
      expect(b.cents).toBe(150)
    })
  })
})
