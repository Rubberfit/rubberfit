import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Profile } from "@/src/entities/profile"
import { Email } from "@/src/entities/value-objects/email"
import { ProfileId } from "@/src/entities/value-objects/id"

const PROFILE_UUID = "550e8400-e29b-41d4-a716-446655440000"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")

function makeProfile(
  overrides: Partial<Parameters<typeof Profile.reconstitute>[0]> = {},
): Profile {
  return Profile.reconstitute({
    id: ProfileId.fromPersistence(PROFILE_UUID),
    firstName: "Steven",
    lastName: "Fojas",
    fullName: "Steven Fojas",
    email: Email.fromPersistence("steven@example.com"),
    isPlatformAdmin: false,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  })
}

describe("Profile", () => {
  describe("reconstitute()", () => {
    it("returns a Profile with all fields populated from props", () => {
      const p = makeProfile()
      expect(p.id.value).toBe(PROFILE_UUID)
      expect(p.firstName).toBe("Steven")
      expect(p.lastName).toBe("Fojas")
      expect(p.fullName).toBe("Steven Fojas")
      expect(p.email?.value).toBe("steven@example.com")
      expect(p.isPlatformAdmin).toBe(false)
    })

    it("does NOT have a create() factory (auth-trigger owns creation)", () => {
      // Compile-time check; documented behavior. Runtime: constructor is
      // private so even reflective access is structural-only.
      expect(typeof (Profile as unknown as { create?: unknown }).create).toBe(
        "undefined",
      )
    })
  })

  describe("updateName()", () => {
    it("updates first and last name; bumps updatedAt", () => {
      const p = makeProfile()
      p.updateName("Bing", "Crosby", T1)
      expect(p.firstName).toBe("Bing")
      expect(p.lastName).toBe("Crosby")
      expect(p.updatedAt).toEqual(T1)
    })

    it("trims whitespace; empty string after trim becomes null", () => {
      const p = makeProfile()
      p.updateName("  Bing  ", "   ", T1)
      expect(p.firstName).toBe("Bing")
      expect(p.lastName).toBeNull()
    })

    it("explicit null clears the field", () => {
      const p = makeProfile()
      p.updateName(null, null, T1)
      expect(p.firstName).toBeNull()
      expect(p.lastName).toBeNull()
    })

    it("is a no-op when name unchanged (no audit bump)", () => {
      const p = makeProfile()
      const before = p.updatedAt
      p.updateName("Steven", "Fojas", T1)
      expect(p.updatedAt).toBe(before)
    })

    it("rejects firstName longer than 100 characters", () => {
      const p = makeProfile()
      expect(() => p.updateName("x".repeat(101), "Fojas", T1)).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects lastName longer than 100 characters", () => {
      const p = makeProfile()
      expect(() => p.updateName("Steven", "x".repeat(101), T1)).toThrow(
        InvalidEntityError,
      )
    })

    it("does not touch fullName (DB-computed; entity treats as read-only)", () => {
      const p = makeProfile()
      const fullBefore = p.fullName
      p.updateName("Bing", "Crosby", T1)
      // fullName remains the cached pre-update value until DB re-fetches
      expect(p.fullName).toBe(fullBefore)
    })
  })

  describe("updateEmail()", () => {
    it("updates the email and bumps updatedAt", () => {
      const p = makeProfile()
      p.updateEmail(Email.create("new@example.com"), T1)
      expect(p.email?.value).toBe("new@example.com")
      expect(p.updatedAt).toEqual(T1)
    })

    it("null clears the email", () => {
      const p = makeProfile()
      p.updateEmail(null, T1)
      expect(p.email).toBeNull()
      expect(p.updatedAt).toEqual(T1)
    })

    it("no-op when same email", () => {
      const p = makeProfile()
      const before = p.updatedAt
      p.updateEmail(Email.create("steven@example.com"), T1)
      expect(p.updatedAt).toBe(before)
    })

    it("no-op when both old and new are null", () => {
      const p = makeProfile({ email: null })
      const before = p.updatedAt
      p.updateEmail(null, T1)
      expect(p.updatedAt).toBe(before)
    })
  })

  describe("grantPlatformAdmin() / revokePlatformAdmin()", () => {
    it("grant: false → true; bumps audit", () => {
      const p = makeProfile()
      p.grantPlatformAdmin(T1)
      expect(p.isPlatformAdmin).toBe(true)
      expect(p.updatedAt).toEqual(T1)
    })

    it("grant: idempotent (no-op when already true)", () => {
      const p = makeProfile({ isPlatformAdmin: true })
      const before = p.updatedAt
      p.grantPlatformAdmin(T1)
      expect(p.updatedAt).toBe(before)
    })

    it("revoke: true → false; bumps audit", () => {
      const p = makeProfile({ isPlatformAdmin: true })
      p.revokePlatformAdmin(T1)
      expect(p.isPlatformAdmin).toBe(false)
      expect(p.updatedAt).toEqual(T1)
    })

    it("revoke: idempotent (no-op when already false)", () => {
      const p = makeProfile()
      const before = p.updatedAt
      p.revokePlatformAdmin(T1)
      expect(p.updatedAt).toBe(before)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields", () => {
      const original = makeProfile({ isPlatformAdmin: true })
      original.updateName("Bing", "Crosby", T1)

      const snapshot = original.toJSON()
      const rehydrated = Profile.fromJSON(snapshot)

      expect(rehydrated.toJSON()).toEqual(snapshot)
    })

    it("emits primitives in the snapshot", () => {
      const p = makeProfile()
      const s = p.toJSON()
      expect(typeof s.id).toBe("string")
      expect(typeof s.email).toBe("string")
      expect(typeof s.createdAt).toBe("string")
      expect(s.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it("handles null email in snapshot round-trip", () => {
      const p = makeProfile({ email: null })
      const rehydrated = Profile.fromJSON(p.toJSON())
      expect(rehydrated.email).toBeNull()
    })
  })
})
