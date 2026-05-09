import { describe, expect, it } from "vitest"

import { Address } from "@/src/entities/address"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import {
  AddressId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"

const ADDRESS_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000020"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

function makeAddress(
  overrides: Partial<Parameters<typeof Address.create>[0]> = {},
) {
  return Address.create(
    {
      id: AddressId.fromPersistence(ADDRESS_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      addressLine1: "123 Main St",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      ...overrides,
    },
    T0,
  )
}

describe("Address", () => {
  describe("create()", () => {
    it("constructs with required fields and US default country", () => {
      const a = makeAddress()
      expect(a.id.value).toBe(ADDRESS_UUID)
      expect(a.addressLine1).toBe("123 Main St")
      expect(a.addressLine2).toBeNull()
      expect(a.city).toBe("Austin")
      expect(a.state).toBe("TX")
      expect(a.postalCode).toBe("78701")
      expect(a.country).toBe("United States")
      expect(a.deletedAt).toBeNull()
    })

    it("trims all fields", () => {
      const a = makeAddress({
        addressLine1: "  123 Main St  ",
        city: "  Austin  ",
        state: "  TX  ",
        postalCode: "  78701  ",
        country: "  Canada  ",
      })
      expect(a.addressLine1).toBe("123 Main St")
      expect(a.city).toBe("Austin")
      expect(a.state).toBe("TX")
      expect(a.postalCode).toBe("78701")
      expect(a.country).toBe("Canada")
    })

    it("addressLine2: empty string treated as null", () => {
      expect(makeAddress({ addressLine2: "" }).addressLine2).toBeNull()
      expect(makeAddress({ addressLine2: "   " }).addressLine2).toBeNull()
      expect(makeAddress({ addressLine2: "Apt 4B" }).addressLine2).toBe("Apt 4B")
    })

    it("rejects empty required fields", () => {
      expect(() => makeAddress({ addressLine1: "" })).toThrow(
        InvalidEntityError,
      )
      expect(() => makeAddress({ city: "  " })).toThrow(InvalidEntityError)
      expect(() => makeAddress({ state: "" })).toThrow(InvalidEntityError)
      expect(() => makeAddress({ postalCode: "" })).toThrow(InvalidEntityError)
    })

    it.each([
      ["addressLine1", "x".repeat(201)],
      ["addressLine2", "x".repeat(201)],
      ["city", "x".repeat(101)],
      ["state", "x".repeat(101)],
      ["postalCode", "x".repeat(21)],
      ["country", "x".repeat(101)],
    ])("rejects overlong %s", (field, value) => {
      const overrides: Partial<Parameters<typeof Address.create>[0]> = {
        [field]: value,
      }
      expect(() => makeAddress(overrides)).toThrow(InvalidEntityError)
    })

    it("error tags the entity name", () => {
      try {
        makeAddress({ addressLine1: "" })
      } catch (err) {
        expect((err as InvalidEntityError).entity).toBe("Address")
      }
    })
  })

  describe("isDeleted", () => {
    it("false when not deleted", () => {
      expect(makeAddress().isDeleted).toBe(false)
    })

    it("true after softDelete", () => {
      const a = makeAddress()
      a.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(a.isDeleted).toBe(true)
    })
  })

  describe("updateDetails()", () => {
    it("changes all fields and bumps audit", () => {
      const a = makeAddress()
      a.updateDetails(
        "456 Oak Ave",
        "Suite 200",
        "Dallas",
        "TX",
        "75201",
        "United States",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(a.addressLine1).toBe("456 Oak Ave")
      expect(a.addressLine2).toBe("Suite 200")
      expect(a.city).toBe("Dallas")
      expect(a.postalCode).toBe("75201")
      expect(a.updatedAt).toEqual(T1)
      expect(a.updatedBy?.value).toBe(ACTOR_UUID)
    })

    it("no-op on full equality", () => {
      const a = makeAddress()
      const before = a.updatedAt
      a.updateDetails(
        "123 Main St",
        null,
        "Austin",
        "TX",
        "78701",
        "United States",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(a.updatedAt).toBe(before)
    })

    it("trims new values", () => {
      const a = makeAddress()
      a.updateDetails(
        "  456 Oak Ave  ",
        null,
        "  Dallas  ",
        "TX",
        "75201",
        "USA",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(a.addressLine1).toBe("456 Oak Ave")
      expect(a.city).toBe("Dallas")
      expect(a.country).toBe("USA")
    })

    it("rejects on a deleted address", () => {
      const a = makeAddress()
      a.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        a.updateDetails(
          "Y",
          null,
          "X",
          "X",
          "X",
          "X",
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("validation failure leaves entity unchanged", () => {
      const a = makeAddress()
      const beforeUpdate = a.toJSON()
      expect(() =>
        a.updateDetails(
          "", // empty line1 — invalid
          null,
          "X",
          "X",
          "X",
          "X",
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
      expect(a.toJSON()).toEqual(beforeUpdate)
    })
  })

  describe("softDelete()", () => {
    it("sets deletedAt and bumps audit", () => {
      const a = makeAddress()
      a.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(a.deletedAt).toEqual(T1)
    })

    it("idempotent", () => {
      const a = makeAddress()
      a.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      a.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(a.deletedAt).toEqual(T1)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields", () => {
      const a = makeAddress({
        addressLine2: "Suite 200",
        country: "Canada",
      })
      a.updateDetails(
        "456 Oak",
        null,
        "Toronto",
        "ON",
        "M5H 2N2",
        "Canada",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      const snapshot = a.toJSON()
      expect(Address.fromJSON(snapshot).toJSON()).toEqual(snapshot)
    })

    it("snapshot uses primitives", () => {
      const out = makeAddress().toJSON()
      expect(typeof out.id).toBe("string")
      expect(typeof out.tenantId).toBe("string")
      expect(typeof out.createdAt).toBe("string")
    })
  })
})
