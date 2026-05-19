import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { MaterialType } from "@/src/entities/material-type"
import {
  MaterialTypeId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"

const MT_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000020"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

function makeMaterialType(
  overrides: Partial<Parameters<typeof MaterialType.create>[0]> = {},
) {
  return MaterialType.create(
    {
      id: MaterialTypeId.fromPersistence(MT_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      name: "3M IJ180 Vinyl",
      ...overrides,
    },
    T0,
  )
}

describe("MaterialType", () => {
  describe("create()", () => {
    it("constructs with required fields and default null optionals", () => {
      const m = makeMaterialType()
      expect(m.id.value).toBe(MT_UUID)
      expect(m.name).toBe("3M IJ180 Vinyl")
      expect(m.description).toBeNull()
      expect(m.minStockSqm).toBeNull()
      expect(m.deletedAt).toBeNull()
    })

    it("trims name and description", () => {
      const m = makeMaterialType({
        name: "  Acrylic  ",
        description: "  Premium grade  ",
      })
      expect(m.name).toBe("Acrylic")
      expect(m.description).toBe("Premium grade")
    })

    it("description: empty/whitespace becomes null; long text is allowed (no max)", () => {
      expect(makeMaterialType({ description: "" }).description).toBeNull()
      expect(makeMaterialType({ description: "  " }).description).toBeNull()
      const longText = "x".repeat(50000)
      expect(makeMaterialType({ description: longText }).description).toBe(
        longText,
      )
    })

    it("rejects empty name", () => {
      expect(() => makeMaterialType({ name: "" })).toThrow(InvalidEntityError)
      expect(() => makeMaterialType({ name: "   " })).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects name longer than 100 chars", () => {
      expect(() => makeMaterialType({ name: "x".repeat(101) })).toThrow(
        InvalidEntityError,
      )
      // 100 exactly is allowed
      expect(() => makeMaterialType({ name: "x".repeat(100) })).not.toThrow()
    })

    it("rejects negative minStockSqm", () => {
      expect(() => makeMaterialType({ minStockSqm: -1 })).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects NaN / non-finite minStockSqm", () => {
      expect(() => makeMaterialType({ minStockSqm: NaN })).toThrow(
        InvalidEntityError,
      )
      expect(() =>
        makeMaterialType({ minStockSqm: Number.POSITIVE_INFINITY }),
      ).toThrow(InvalidEntityError)
    })

    it("accepts zero minStockSqm", () => {
      expect(makeMaterialType({ minStockSqm: 0 }).minStockSqm).toBe(0)
    })

    it("error tags the entity name", () => {
      try {
        makeMaterialType({ name: "" })
      } catch (err) {
        expect((err as InvalidEntityError).entity).toBe("MaterialType")
      }
    })
  })

  describe("isDeleted", () => {
    it("false initially", () => {
      expect(makeMaterialType().isDeleted).toBe(false)
    })

    it("true after softDelete", () => {
      const m = makeMaterialType()
      m.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(m.isDeleted).toBe(true)
    })
  })

  describe("updateDetails()", () => {
    it("changes all fields and bumps audit", () => {
      const m = makeMaterialType()
      m.updateDetails(
        "Vinyl Premium",
        "Top tier",
        100,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(m.name).toBe("Vinyl Premium")
      expect(m.description).toBe("Top tier")
      expect(m.minStockSqm).toBe(100)
      expect(m.updatedAt).toEqual(T1)
      expect(m.updatedBy?.value).toBe(ACTOR_UUID)
    })

    it("no-op on full equality", () => {
      const m = makeMaterialType()
      const before = m.updatedAt
      m.updateDetails(
        "3M IJ180 Vinyl",
        null,
        null,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(m.updatedAt).toBe(before)
    })

    it("trims new values", () => {
      const m = makeMaterialType()
      m.updateDetails(
        "  Vinyl  ",
        "  desc  ",
        50,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(m.name).toBe("Vinyl")
      expect(m.description).toBe("desc")
    })

    it("rejects on a deleted material type", () => {
      const m = makeMaterialType()
      m.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        m.updateDetails(
          "X",
          null,
          null,
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("validation failure leaves entity unchanged", () => {
      const m = makeMaterialType()
      const before = m.toJSON()
      expect(() =>
        m.updateDetails(
          "",
          null,
          null,
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
      expect(m.toJSON()).toEqual(before)
    })
  })

  describe("softDelete()", () => {
    it("sets deletedAt + bumps audit", () => {
      const m = makeMaterialType()
      m.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(m.deletedAt).toEqual(T1)
    })

    it("idempotent", () => {
      const m = makeMaterialType()
      m.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      m.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(m.deletedAt).toEqual(T1)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields", () => {
      const m = makeMaterialType({
        description: "test",
        minStockSqm: 50,
      })
      m.updateDetails(
        "Vinyl Updated",
        "Updated desc",
        100,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      const snapshot = m.toJSON()
      expect(MaterialType.fromJSON(snapshot).toJSON()).toEqual(snapshot)
    })

    it("snapshot uses primitives", () => {
      const out = makeMaterialType().toJSON()
      expect(typeof out.id).toBe("string")
      expect(typeof out.tenantId).toBe("string")
      expect(typeof out.createdAt).toBe("string")
    })
  })
})
