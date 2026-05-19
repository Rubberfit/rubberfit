import { describe, expect, it } from "vitest"

import { InvalidValueObjectError } from "@/src/entities/errors/invalid-value-object.error"
import { InvitationToken } from "@/src/entities/value-objects/invitation-token"

const VALID_TOKEN = "0123456789abcdef".repeat(4) // 64 hex chars
const VALID_TOKEN_UPPERCASE = "0123456789ABCDEF".repeat(4)

describe("InvitationToken", () => {
  describe("create()", () => {
    it("accepts 64 lowercase hex characters", () => {
      const t = InvitationToken.create(VALID_TOKEN)
      expect(t.value).toBe(VALID_TOKEN)
    })

    it("normalizes uppercase input to lowercase", () => {
      const t = InvitationToken.create(VALID_TOKEN_UPPERCASE)
      expect(t.value).toBe(VALID_TOKEN)
    })

    it.each([
      ["too short", "abc"],
      ["one char short of 64", "a".repeat(63)],
      ["one char over 64", "a".repeat(65)],
      ["empty", ""],
    ])("rejects wrong length: %s", (_label, input) => {
      expect(() => InvitationToken.create(input)).toThrow(
        InvalidValueObjectError,
      )
    })

    it.each([
      ["g (non-hex)", `${"a".repeat(63)}g`],
      ["whitespace inside", `${"a".repeat(31)} ${"a".repeat(32)}`],
      ["dashes (UUID-style)", "550e8400-e29b-41d4-a716-446655440000-000000000000000000000000000"],
    ])("rejects non-hex content: %s", (_label, input) => {
      expect(() => InvitationToken.create(input)).toThrow(
        InvalidValueObjectError,
      )
    })

    it("error has correct VO label and code", () => {
      try {
        InvitationToken.create("bad")
        throw new Error("expected throw")
      } catch (err) {
        const e = err as InvalidValueObjectError
        expect(e.valueObject).toBe("InvitationToken")
        expect(e.code).toBe("INVALID_VALUE_OBJECT")
      }
    })
  })

  describe("fromPersistence()", () => {
    it("trusts the DB value (no length/regex check)", () => {
      const t = InvitationToken.fromPersistence("anything")
      expect(t.value).toBe("anything")
    })
  })

  describe("equals()", () => {
    it("is true for same value", () => {
      const a = InvitationToken.create(VALID_TOKEN)
      const b = InvitationToken.create(VALID_TOKEN)
      expect(a.equals(b)).toBe(true)
    })

    it("treats uppercase + lowercase forms as equal after create() (lowercase normalization)", () => {
      const a = InvitationToken.create(VALID_TOKEN_UPPERCASE)
      const b = InvitationToken.create(VALID_TOKEN)
      expect(a.equals(b)).toBe(true)
    })

    it("is false for null/undefined", () => {
      const a = InvitationToken.create(VALID_TOKEN)
      expect(a.equals(null)).toBe(false)
      expect(a.equals(undefined)).toBe(false)
    })
  })

  describe("serialization", () => {
    it("toJSON returns the raw token string", () => {
      const t = InvitationToken.create(VALID_TOKEN)
      expect(JSON.stringify(t)).toBe(`"${VALID_TOKEN}"`)
    })
  })
})
