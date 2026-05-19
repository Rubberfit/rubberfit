import { describe, expect, it } from "vitest"

import { nullableEqual } from "@/src/entities/shared/equality"
import { Currency } from "@/src/entities/value-objects/currency"
import { Email } from "@/src/entities/value-objects/email"

describe("nullableEqual()", () => {
  it("returns true for both null", () => {
    expect(nullableEqual<Email>(null, null)).toBe(true)
  })

  it("returns false when only first is null", () => {
    expect(nullableEqual(null, Email.create("a@b.com"))).toBe(false)
  })

  it("returns false when only second is null", () => {
    expect(nullableEqual(Email.create("a@b.com"), null)).toBe(false)
  })

  it("delegates to equals() when both non-null — true case", () => {
    const a = Email.create("a@b.com")
    const b = Email.create("a@b.com")
    expect(nullableEqual(a, b)).toBe(true)
  })

  it("delegates to equals() when both non-null — false case", () => {
    const a = Email.create("a@b.com")
    const b = Email.create("c@d.com")
    expect(nullableEqual(a, b)).toBe(false)
  })

  it("works with any VO that has an equals method (Currency)", () => {
    expect(
      nullableEqual(Currency.create("USD"), Currency.create("USD")),
    ).toBe(true)
    expect(
      nullableEqual(Currency.create("USD"), Currency.create("EUR")),
    ).toBe(false)
  })

  it("works with custom equals implementations", () => {
    class Custom {
      constructor(public n: number) {}
      equals(other: Custom): boolean {
        return this.n === other.n
      }
    }
    expect(nullableEqual(new Custom(1), new Custom(1))).toBe(true)
    expect(nullableEqual(new Custom(1), new Custom(2))).toBe(false)
    expect(nullableEqual(new Custom(1), null)).toBe(false)
  })
})
