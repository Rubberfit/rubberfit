import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { MaterialSupplier } from "@/src/entities/material-supplier"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  MaterialSupplierId,
  MaterialTypeId,
  ProfileId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"

const MS_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const MT_UUID = "00000000-0000-4000-8000-000000000020"
const SUPPLIER_UUID = "00000000-0000-4000-8000-000000000030"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000040"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

const USD = Currency.create("USD")
const EUR = Currency.create("EUR")

const EFFECTIVE = new Date("2026-01-01T00:00:00.000Z")
const EXPIRES = new Date("2026-12-31T00:00:00.000Z")
const NEW_EFFECTIVE = new Date("2026-05-01T00:00:00.000Z")
const NEW_EXPIRES = new Date("2027-04-30T00:00:00.000Z")

function makeMS(
  overrides: Partial<Parameters<typeof MaterialSupplier.create>[0]> = {},
) {
  return MaterialSupplier.create(
    {
      id: MaterialSupplierId.fromPersistence(MS_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
      supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
      cost: Money.fromCents(4500, USD),
      effectiveDate: EFFECTIVE,
      expirationDate: EXPIRES,
      ...overrides,
    },
    T0,
  )
}

describe("MaterialSupplier", () => {
  describe("create()", () => {
    it("constructs with required fields", () => {
      const ms = makeMS()
      expect(ms.cost.cents).toBe(4500)
      expect(ms.cost.currency.value).toBe("USD")
      expect(ms.effectiveDate).toEqual(EFFECTIVE)
      expect(ms.expirationDate).toEqual(EXPIRES)
      expect(ms.minimumOrderSqm).toBe(0)
      expect(ms.leadTimeDays).toBe(0)
      expect(ms.preferredSupplier).toBe(false)
      expect(ms.isActive).toBe(true)
    })

    it("rejects zero cost (DB CHECK is > 0)", () => {
      expect(() => makeMS({ cost: Money.fromCents(0, USD) })).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects negative cost", () => {
      expect(() => makeMS({ cost: Money.fromCents(-1, USD) })).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects expirationDate <= effectiveDate", () => {
      expect(() =>
        makeMS({ effectiveDate: EXPIRES, expirationDate: EFFECTIVE }),
      ).toThrow(InvalidEntityError)
      expect(() =>
        makeMS({ effectiveDate: EFFECTIVE, expirationDate: EFFECTIVE }),
      ).toThrow(InvalidEntityError)
    })

    it("accepts null expirationDate (open-ended)", () => {
      const ms = makeMS({ expirationDate: null })
      expect(ms.expirationDate).toBeNull()
    })

    it("rejects negative minimumOrderSqm", () => {
      expect(() => makeMS({ minimumOrderSqm: -1 })).toThrow(InvalidEntityError)
    })

    it("rejects non-integer leadTimeDays", () => {
      expect(() => makeMS({ leadTimeDays: 1.5 })).toThrow(InvalidEntityError)
    })

    it("rejects negative leadTimeDays", () => {
      expect(() => makeMS({ leadTimeDays: -1 })).toThrow(InvalidEntityError)
    })
  })

  describe("updateDetails() — non-pricing only", () => {
    it("changes metadata and bumps audit", () => {
      const ms = makeMS()
      ms.updateDetails(
        "ACM-001",
        100,
        14,
        true,
        "Preferred for IJ180",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(ms.supplierMaterialCode).toBe("ACM-001")
      expect(ms.minimumOrderSqm).toBe(100)
      expect(ms.leadTimeDays).toBe(14)
      expect(ms.preferredSupplier).toBe(true)
      expect(ms.notes).toBe("Preferred for IJ180")
      expect(ms.updatedAt).toEqual(T1)
    })

    it("does NOT touch cost / effectiveDate / expirationDate", () => {
      const ms = makeMS()
      ms.updateDetails(
        null,
        50,
        7,
        false,
        null,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(ms.cost.cents).toBe(4500)
      expect(ms.effectiveDate).toEqual(EFFECTIVE)
      expect(ms.expirationDate).toEqual(EXPIRES)
    })

    it("no-op on full equality", () => {
      const ms = makeMS()
      const before = ms.updatedAt
      ms.updateDetails(
        null,
        0,
        0,
        false,
        null,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(ms.updatedAt).toBe(before)
    })

    it("rejects on a deleted row", () => {
      const ms = makeMS()
      ms.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        ms.updateDetails(
          null,
          0,
          0,
          false,
          null,
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("updatePricing() — strict price-change semantics", () => {
    it("changes cost and window and bumps audit", () => {
      const ms = makeMS()
      ms.updatePricing(
        Money.fromCents(5200, USD),
        NEW_EFFECTIVE,
        NEW_EXPIRES,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(ms.cost.cents).toBe(5200)
      expect(ms.effectiveDate).toEqual(NEW_EFFECTIVE)
      expect(ms.expirationDate).toEqual(NEW_EXPIRES)
      expect(ms.updatedAt).toEqual(T1)
    })

    it("REJECTS unchanged cost (force callers to use updatePricingWindow)", () => {
      const ms = makeMS()
      expect(() =>
        ms.updatePricing(
          Money.fromCents(4500, USD),
          NEW_EFFECTIVE,
          NEW_EXPIRES,
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("rejects zero or negative new cost", () => {
      const ms = makeMS()
      expect(() =>
        ms.updatePricing(
          Money.fromCents(0, USD),
          NEW_EFFECTIVE,
          NEW_EXPIRES,
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("rejects invalid window", () => {
      const ms = makeMS()
      expect(() =>
        ms.updatePricing(
          Money.fromCents(5200, USD),
          NEW_EXPIRES,
          NEW_EFFECTIVE,
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("rejects on a deleted row", () => {
      const ms = makeMS()
      ms.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        ms.updatePricing(
          Money.fromCents(5200, USD),
          NEW_EFFECTIVE,
          NEW_EXPIRES,
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("allows currency switch (entity-level — use-case may further restrict)", () => {
      // The entity does not enforce same-currency on a price change;
      // a tenant-currency change is conceptually rare but not blocked here.
      const ms = makeMS()
      ms.updatePricing(
        Money.fromCents(4200, EUR),
        NEW_EFFECTIVE,
        NEW_EXPIRES,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(ms.cost.currency.value).toBe("EUR")
    })
  })

  describe("updatePricingWindow() — window-only", () => {
    it("changes window without touching cost", () => {
      const ms = makeMS()
      ms.updatePricingWindow(
        NEW_EFFECTIVE,
        NEW_EXPIRES,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(ms.cost.cents).toBe(4500)
      expect(ms.effectiveDate).toEqual(NEW_EFFECTIVE)
      expect(ms.expirationDate).toEqual(NEW_EXPIRES)
    })

    it("supports window extension to null (open-ended)", () => {
      const ms = makeMS()
      ms.updatePricingWindow(
        EFFECTIVE,
        null,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(ms.expirationDate).toBeNull()
    })

    it("no-op when both dates unchanged", () => {
      const ms = makeMS()
      const before = ms.updatedAt
      ms.updatePricingWindow(
        EFFECTIVE,
        EXPIRES,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(ms.updatedAt).toBe(before)
    })

    it("rejects invalid window", () => {
      const ms = makeMS()
      expect(() =>
        ms.updatePricingWindow(
          NEW_EXPIRES,
          NEW_EFFECTIVE,
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("rejects on a deleted row", () => {
      const ms = makeMS()
      ms.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        ms.updatePricingWindow(
          NEW_EFFECTIVE,
          NEW_EXPIRES,
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("activation toggles", () => {
    it("deactivate flips isActive to false; idempotent", () => {
      const ms = makeMS()
      ms.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(ms.isActive).toBe(false)
      const before = ms.updatedAt
      ms.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(ms.updatedAt).toBe(before)
    })

    it("reactivate flips isActive back to true", () => {
      const ms = makeMS()
      ms.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      ms.reactivate(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(ms.isActive).toBe(true)
    })

    it("toggles reject on a deleted row", () => {
      const ms = makeMS()
      ms.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        ms.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("softDelete()", () => {
    it("sets deletedAt; idempotent", () => {
      const ms = makeMS()
      ms.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      ms.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(ms.deletedAt).toEqual(T1)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields including Money", () => {
      const ms = makeMS({ supplierMaterialCode: "ACM-001" })
      ms.updatePricing(
        Money.fromCents(5200, USD),
        NEW_EFFECTIVE,
        NEW_EXPIRES,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      const snap = ms.toJSON()
      expect(MaterialSupplier.fromJSON(snap).toJSON()).toEqual(snap)
    })
  })
})
