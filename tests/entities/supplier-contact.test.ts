import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { SupplierContact } from "@/src/entities/supplier-contact"
import {
  PersonId,
  ProfileId,
  SupplierContactId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"

const SC_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const SUPPLIER_UUID = "00000000-0000-4000-8000-000000000020"
const PERSON_UUID = "00000000-0000-4000-8000-000000000030"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000040"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

function makeContact(
  overrides: Partial<Parameters<typeof SupplierContact.create>[0]> = {},
) {
  return SupplierContact.create(
    {
      id: SupplierContactId.fromPersistence(SC_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
      personId: PersonId.fromPersistence(PERSON_UUID),
      ...overrides,
    },
    T0,
  )
}

describe("SupplierContact", () => {
  describe("create()", () => {
    it("constructs with required FKs and default null/false metadata", () => {
      const c = makeContact()
      expect(c.id.value).toBe(SC_UUID)
      expect(c.supplierId.value).toBe(SUPPLIER_UUID)
      expect(c.personId.value).toBe(PERSON_UUID)
      expect(c.title).toBeNull()
      expect(c.role).toBeNull()
      expect(c.department).toBeNull()
      expect(c.isPrimary).toBe(false)
      expect(c.isActive).toBe(true)
    })

    it("trims metadata fields", () => {
      const c = makeContact({
        title: "  CEO  ",
        role: "  Buyer  ",
        department: "  Procurement  ",
      })
      expect(c.title).toBe("CEO")
      expect(c.role).toBe("Buyer")
      expect(c.department).toBe("Procurement")
    })

    it.each([
      ["title", "x".repeat(101)],
      ["role", "x".repeat(51)],
      ["department", "x".repeat(101)],
    ])("rejects overlong %s", (field, value) => {
      const overrides: Partial<Parameters<typeof SupplierContact.create>[0]> =
        { [field]: value }
      expect(() => makeContact(overrides)).toThrow(InvalidEntityError)
    })

    it("can be created already-primary", () => {
      const c = makeContact({ isPrimary: true })
      expect(c.isPrimary).toBe(true)
    })
  })

  describe("updateDetails()", () => {
    it("changes metadata and bumps audit", () => {
      const c = makeContact()
      c.updateDetails(
        "VP",
        "Director",
        "Sales",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(c.title).toBe("VP")
      expect(c.role).toBe("Director")
      expect(c.department).toBe("Sales")
      expect(c.updatedAt).toEqual(T1)
    })

    it("no-op on full equality", () => {
      const c = makeContact({ title: "X" })
      const before = c.updatedAt
      c.updateDetails(
        "X",
        null,
        null,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(c.updatedAt).toBe(before)
    })

    it("rejects on a deleted contact", () => {
      const c = makeContact()
      c.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        c.updateDetails(
          "X",
          null,
          null,
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("markPrimary / clearPrimary", () => {
    it("markPrimary sets isPrimary=true", () => {
      const c = makeContact()
      c.markPrimary(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(c.isPrimary).toBe(true)
    })

    it("markPrimary is idempotent", () => {
      const c = makeContact({ isPrimary: true })
      const before = c.updatedAt
      c.markPrimary(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(c.updatedAt).toBe(before)
    })

    it("markPrimary rejects an inactive contact", () => {
      const c = makeContact()
      c.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        c.markPrimary(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })

    it("markPrimary rejects on a soft-deleted contact", () => {
      const c = makeContact()
      c.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        c.markPrimary(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })

    it("clearPrimary flips isPrimary off", () => {
      const c = makeContact({ isPrimary: true })
      c.clearPrimary(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(c.isPrimary).toBe(false)
    })

    it("clearPrimary is idempotent", () => {
      const c = makeContact()
      const before = c.updatedAt
      c.clearPrimary(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(c.updatedAt).toBe(before)
    })
  })

  describe("deactivate / reactivate", () => {
    it("deactivate flips isActive to false", () => {
      const c = makeContact()
      c.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(c.isActive).toBe(false)
    })

    it("deactivate auto-clears isPrimary", () => {
      const c = makeContact({ isPrimary: true })
      c.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(c.isPrimary).toBe(false)
      expect(c.isActive).toBe(false)
    })

    it("deactivate is idempotent", () => {
      const c = makeContact()
      c.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      const before = c.updatedAt
      c.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(c.updatedAt).toBe(before)
    })

    it("reactivate restores isActive but does NOT auto-restore primary", () => {
      const c = makeContact({ isPrimary: true })
      c.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      c.reactivate(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(c.isActive).toBe(true)
      expect(c.isPrimary).toBe(false)
    })

    it("reactivate is idempotent", () => {
      const c = makeContact()
      const before = c.updatedAt
      c.reactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(c.updatedAt).toBe(before)
    })

    it("deactivate / reactivate reject on soft-deleted contact", () => {
      const c = makeContact()
      c.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        c.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
      expect(() =>
        c.reactivate(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("softDelete()", () => {
    it("sets deletedAt + idempotent", () => {
      const c = makeContact()
      c.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      c.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(c.deletedAt).toEqual(T1)
      expect(c.isDeleted).toBe(true)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields", () => {
      const c = makeContact({
        title: "CEO",
        role: "Decision-maker",
        department: "Executive",
        isPrimary: true,
      })
      const snap = c.toJSON()
      expect(SupplierContact.fromJSON(snap).toJSON()).toEqual(snap)
    })
  })
})
