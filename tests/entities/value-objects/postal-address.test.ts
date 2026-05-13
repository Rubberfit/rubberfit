import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { PostalAddress } from "@/src/entities/value-objects/postal-address"

describe("PostalAddress", () => {
  describe("create()", () => {
    it("constructs with required fields and defaults country to United States", () => {
      const a = PostalAddress.create({
        line1: "100 Mill St",
        city: "Brooklyn",
        state: "NY",
        postalCode: "11211",
      })
      expect(a.line1).toBe("100 Mill St")
      expect(a.line2).toBeNull()
      expect(a.city).toBe("Brooklyn")
      expect(a.state).toBe("NY")
      expect(a.postalCode).toBe("11211")
      expect(a.country).toBe("United States")
    })

    it("accepts an optional line2", () => {
      const a = PostalAddress.create({
        line1: "1 Foo",
        line2: "Suite 200",
        city: "X",
        state: "Y",
        postalCode: "1",
      })
      expect(a.line2).toBe("Suite 200")
    })

    it("accepts an explicit country", () => {
      const a = PostalAddress.create({
        line1: "1 Foo",
        city: "Toronto",
        state: "ON",
        postalCode: "M5A",
        country: "Canada",
      })
      expect(a.country).toBe("Canada")
    })

    it("trims whitespace on all fields", () => {
      const a = PostalAddress.create({
        line1: "  100 Mill St  ",
        line2: "  Suite 4  ",
        city: "  Brooklyn  ",
        state: " NY ",
        postalCode: " 11211 ",
        country: " United States ",
      })
      expect(a.line1).toBe("100 Mill St")
      expect(a.line2).toBe("Suite 4")
      expect(a.city).toBe("Brooklyn")
    })

    it("rejects empty required fields", () => {
      expect(() =>
        PostalAddress.create({ line1: "", city: "X", state: "Y", postalCode: "1" })
      ).toThrow(InvalidEntityError)
      expect(() =>
        PostalAddress.create({ line1: "X", city: "", state: "Y", postalCode: "1" })
      ).toThrow(InvalidEntityError)
    })
  })

  describe("equals()", () => {
    const make = () =>
      PostalAddress.create({
        line1: "1 Foo",
        line2: "Suite 200",
        city: "X",
        state: "Y",
        postalCode: "1",
      })

    it("returns true for identical fields", () => {
      expect(make().equals(make())).toBe(true)
    })

    it("returns false for any field difference", () => {
      const base = make()
      expect(
        base.equals(
          PostalAddress.create({
            line1: "1 Foo",
            line2: "Suite 200",
            city: "DIFFERENT",
            state: "Y",
            postalCode: "1",
          })
        )
      ).toBe(false)
    })

    it("returns false for null or undefined", () => {
      const a = make()
      expect(a.equals(null)).toBe(false)
      expect(a.equals(undefined)).toBe(false)
    })
  })

  describe("fromRow()", () => {
    it("returns null when line1 is missing — the convention for 'no address'", () => {
      expect(
        PostalAddress.fromRow({
          line1: null,
          line2: null,
          city: null,
          state: null,
          postal_code: null,
          country: null,
        })
      ).toBeNull()
    })

    it("hydrates a VO from a flat row segment when line1 is present", () => {
      const a = PostalAddress.fromRow({
        line1: "1 Foo",
        line2: null,
        city: "X",
        state: "Y",
        postal_code: "1",
        country: "Canada",
      })
      expect(a?.line1).toBe("1 Foo")
      expect(a?.country).toBe("Canada")
    })
  })

  describe("toJSON / fromSnapshot round-trip", () => {
    it("preserves all fields", () => {
      const a = PostalAddress.create({
        line1: "1 Foo",
        line2: "Suite 200",
        city: "X",
        state: "Y",
        postalCode: "1",
      })
      const b = PostalAddress.fromSnapshot(a.toJSON())
      expect(b.equals(a)).toBe(true)
    })
  })
})
