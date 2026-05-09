import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Person } from "@/src/entities/person"
import { Email } from "@/src/entities/value-objects/email"
import {
  PersonId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"

const PERSON_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const PROFILE_UUID = "00000000-0000-4000-8000-000000000020"
const OTHER_PROFILE_UUID = "00000000-0000-4000-8000-000000000021"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000030"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

function makePerson(
  overrides: Partial<Parameters<typeof Person.create>[0]> = {},
) {
  return Person.create(
    {
      id: PersonId.fromPersistence(PERSON_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      firstName: "Steven",
      lastName: "Fojas",
      email: Email.create("steven@example.com"),
      ...overrides,
    },
    T0,
  )
}

describe("Person", () => {
  describe("create()", () => {
    it("constructs with required fields", () => {
      const p = makePerson()
      expect(p.id.value).toBe(PERSON_UUID)
      expect(p.firstName).toBe("Steven")
      expect(p.lastName).toBe("Fojas")
      expect(p.email?.value).toBe("steven@example.com")
      expect(p.phone).toBeNull()
      expect(p.mobile).toBeNull()
      expect(p.notes).toBeNull()
      expect(p.profileId).toBeNull()
    })

    it("trims first/last name", () => {
      const p = makePerson({ firstName: "  Steven  ", lastName: "  Fojas  " })
      expect(p.firstName).toBe("Steven")
      expect(p.lastName).toBe("Fojas")
    })

    it("rejects empty firstName / lastName", () => {
      expect(() => makePerson({ firstName: "" })).toThrow(InvalidEntityError)
      expect(() => makePerson({ lastName: "   " })).toThrow(InvalidEntityError)
    })

    it("rejects names longer than 100 chars", () => {
      expect(() => makePerson({ firstName: "x".repeat(101) })).toThrow(
        InvalidEntityError,
      )
    })

    it("phone/mobile: empty string treated as null", () => {
      const p = makePerson({ email: null, phone: "555-1234", mobile: "  " })
      expect(p.phone).toBe("555-1234")
      expect(p.mobile).toBeNull()
    })

    it("phone/mobile rejects overlong (30 chars)", () => {
      expect(() =>
        makePerson({ email: null, phone: "x".repeat(31) }),
      ).toThrow(InvalidEntityError)
    })

    it("notes trimmed; empty becomes null; no length cap", () => {
      const p1 = makePerson({ notes: "   " })
      expect(p1.notes).toBeNull()

      const longNote = "x".repeat(10000)
      expect(() => makePerson({ notes: longNote })).not.toThrow()
    })

    describe("multi-field invariant: at least one of email/phone/mobile", () => {
      it("rejects when ALL three are null", () => {
        expect(() =>
          makePerson({ email: null, phone: null, mobile: null }),
        ).toThrow(InvalidEntityError)
      })

      it("rejects when ALL three are absent / empty-effectively-null", () => {
        expect(() =>
          makePerson({
            email: null,
            phone: "  ",
            mobile: undefined,
          }),
        ).toThrow(InvalidEntityError)
      })

      it("accepts with only email", () => {
        expect(() =>
          makePerson({ phone: null, mobile: null }),
        ).not.toThrow()
      })

      it("accepts with only phone", () => {
        expect(() =>
          makePerson({
            email: null,
            phone: "555-1234",
            mobile: null,
          }),
        ).not.toThrow()
      })

      it("accepts with only mobile", () => {
        expect(() =>
          makePerson({
            email: null,
            phone: null,
            mobile: "555-9999",
          }),
        ).not.toThrow()
      })

      it("error message names the invariant", () => {
        try {
          makePerson({ email: null, phone: null, mobile: null })
        } catch (err) {
          expect((err as InvalidEntityError).message).toContain(
            "contact method",
          )
        }
      })
    })
  })

  describe("state queries", () => {
    it("hasPortalAccount: false without profileId, true with it", () => {
      expect(makePerson().hasPortalAccount).toBe(false)
      expect(
        makePerson({
          profileId: ProfileId.fromPersistence(PROFILE_UUID),
        }).hasPortalAccount,
      ).toBe(true)
    })

    it("fullName concatenates first + last", () => {
      expect(makePerson().fullName).toBe("Steven Fojas")
    })

    it("isDeleted: false initially, true after softDelete", () => {
      const p = makePerson()
      expect(p.isDeleted).toBe(false)
      p.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.isDeleted).toBe(true)
    })
  })

  describe("updateDetails()", () => {
    it("aggregated update with one audit event", () => {
      const p = makePerson()
      p.updateDetails(
        "Bing",
        "Crosby",
        Email.create("bing@example.com"),
        "555-1234",
        "555-5678",
        "VIP customer",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(p.firstName).toBe("Bing")
      expect(p.lastName).toBe("Crosby")
      expect(p.email?.value).toBe("bing@example.com")
      expect(p.phone).toBe("555-1234")
      expect(p.mobile).toBe("555-5678")
      expect(p.notes).toBe("VIP customer")
      expect(p.updatedAt).toEqual(T1)
    })

    it("no-op on full equality", () => {
      const p = makePerson()
      const before = p.updatedAt
      p.updateDetails(
        "Steven",
        "Fojas",
        Email.create("steven@example.com"),
        null,
        null,
        null,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(p.updatedAt).toBe(before)
    })

    it("re-enforces multi-field invariant — rejects clearing all three contacts", () => {
      const p = makePerson()
      expect(() =>
        p.updateDetails(
          "Steven",
          "Fojas",
          null,
          null,
          null,
          null,
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("invariant failure leaves entity untouched (state-before == state-after)", () => {
      const p = makePerson()
      const before = p.toJSON()
      try {
        p.updateDetails(
          "NEW",
          "NAME",
          null,
          null,
          null,
          "would have changed",
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        )
      } catch {
        /* expected */
      }
      expect(p.toJSON()).toEqual(before)
    })

    it("rejects on a deleted person", () => {
      const p = makePerson()
      p.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        p.updateDetails(
          "X",
          "X",
          null,
          "555-1234",
          null,
          null,
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("linkProfile() / unlinkProfile()", () => {
    it("link: sets profileId", () => {
      const p = makePerson()
      p.linkProfile(
        ProfileId.fromPersistence(PROFILE_UUID),
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(p.profileId?.value).toBe(PROFILE_UUID)
      expect(p.hasPortalAccount).toBe(true)
    })

    it("link: idempotent on same profile", () => {
      const p = makePerson({
        profileId: ProfileId.fromPersistence(PROFILE_UUID),
      })
      const before = p.updatedAt
      p.linkProfile(
        ProfileId.fromPersistence(PROFILE_UUID),
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(p.updatedAt).toBe(before)
    })

    it("link: throws when a different profile is already linked", () => {
      const p = makePerson({
        profileId: ProfileId.fromPersistence(PROFILE_UUID),
      })
      expect(() =>
        p.linkProfile(
          ProfileId.fromPersistence(OTHER_PROFILE_UUID),
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("unlink: clears profileId", () => {
      const p = makePerson({
        profileId: ProfileId.fromPersistence(PROFILE_UUID),
      })
      p.unlinkProfile(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.profileId).toBeNull()
    })

    it("unlink: idempotent if already null", () => {
      const p = makePerson()
      const before = p.updatedAt
      p.unlinkProfile(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.updatedAt).toBe(before)
    })

    it("unlink-then-link sequence allows swap", () => {
      const p = makePerson({
        profileId: ProfileId.fromPersistence(PROFILE_UUID),
      })
      p.unlinkProfile(ProfileId.fromPersistence(ACTOR_UUID), T1)
      p.linkProfile(
        ProfileId.fromPersistence(OTHER_PROFILE_UUID),
        ProfileId.fromPersistence(ACTOR_UUID),
        T2,
      )
      expect(p.profileId?.value).toBe(OTHER_PROFILE_UUID)
    })
  })

  describe("softDelete()", () => {
    it("sets deletedAt and bumps audit", () => {
      const p = makePerson()
      p.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.deletedAt).toEqual(T1)
    })

    it("idempotent", () => {
      const p = makePerson()
      p.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      p.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(p.deletedAt).toEqual(T1)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields including profileId link", () => {
      const original = makePerson({
        phone: "555-1234",
        mobile: "555-5678",
        notes: "Repeat customer",
        profileId: ProfileId.fromPersistence(PROFILE_UUID),
      })
      const snapshot = original.toJSON()
      expect(Person.fromJSON(snapshot).toJSON()).toEqual(snapshot)
    })

    it("null email is null in snapshot", () => {
      const p = makePerson({
        email: null,
        phone: "555-1234",
      })
      expect(p.toJSON().email).toBeNull()
    })
  })
})
