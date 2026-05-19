import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { PriceHistory } from "@/src/entities/price-history"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  MaterialSupplierId,
  PriceHistoryId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"

const PH_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const MS_UUID = "00000000-0000-4000-8000-000000000020"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000030"

const T0 = new Date("2026-05-09T12:00:00.000Z")

const USD = Currency.create("USD")
const EUR = Currency.create("EUR")

function makePH(
  overrides: Partial<Parameters<typeof PriceHistory.create>[0]> = {},
) {
  return PriceHistory.create(
    {
      id: PriceHistoryId.fromPersistence(PH_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      materialSupplierId: MaterialSupplierId.fromPersistence(MS_UUID),
      oldCost: Money.fromCents(4500, USD),
      newCost: Money.fromCents(5200, USD),
      ...overrides,
    },
    T0,
  )
}

describe("PriceHistory", () => {
  describe("create()", () => {
    it("constructs with old + new cost; computes percentage", () => {
      const ph = makePH()
      expect(ph.oldCost?.cents).toBe(4500)
      expect(ph.newCost.cents).toBe(5200)
      // (5200-4500)/4500 * 100 = 15.5556 (rounded to 4 decimals)
      expect(ph.priceChangePercentage).toBeCloseTo(15.5556, 4)
    })

    it("first-ever price (oldCost=null) → percentage=null", () => {
      const ph = makePH({ oldCost: null })
      expect(ph.oldCost).toBeNull()
      expect(ph.priceChangePercentage).toBeNull()
      expect(ph.isInitial).toBe(true)
    })

    it("rejects same old/new cost", () => {
      expect(() =>
        makePH({
          oldCost: Money.fromCents(4500, USD),
          newCost: Money.fromCents(4500, USD),
        }),
      ).toThrow(InvalidEntityError)
    })

    it("rejects cross-currency old/new", () => {
      expect(() =>
        makePH({
          oldCost: Money.fromCents(4500, USD),
          newCost: Money.fromCents(4500, EUR),
        }),
      ).toThrow(InvalidEntityError)
    })

    it("rejects zero or negative new cost", () => {
      expect(() =>
        makePH({ newCost: Money.fromCents(0, USD) }),
      ).toThrow(InvalidEntityError)
      expect(() =>
        makePH({ newCost: Money.fromCents(-1, USD) }),
      ).toThrow(InvalidEntityError)
    })

    it("rejects zero or negative old cost (when provided)", () => {
      expect(() =>
        makePH({ oldCost: Money.fromCents(0, USD) }),
      ).toThrow(InvalidEntityError)
    })

    it("computes negative percentage for a price decrease", () => {
      const ph = makePH({
        oldCost: Money.fromCents(5000, USD),
        newCost: Money.fromCents(4500, USD),
      })
      // (4500-5000)/5000 * 100 = -10
      expect(ph.priceChangePercentage).toBe(-10)
    })

    it("trims changeReason and rejects overlong", () => {
      const ph = makePH({ changeReason: "  Supplier hike  " })
      expect(ph.changeReason).toBe("Supplier hike")
      expect(() => makePH({ changeReason: "x".repeat(201) })).toThrow(
        InvalidEntityError,
      )
    })

    it("defaults effectiveDate to now when absent", () => {
      const ph = makePH()
      expect(ph.effectiveDate).toEqual(T0)
    })

    it("captures changedBy", () => {
      const ph = makePH({
        changedBy: ProfileId.fromPersistence(ACTOR_UUID),
      })
      expect(ph.changedBy?.value).toBe(ACTOR_UUID)
    })
  })

  describe("state queries", () => {
    it("isInitial / isIncrease / isDecrease", () => {
      const initial = makePH({ oldCost: null })
      expect(initial.isInitial).toBe(true)
      expect(initial.isIncrease).toBe(false)
      expect(initial.isDecrease).toBe(false)

      const inc = makePH({
        oldCost: Money.fromCents(4500, USD),
        newCost: Money.fromCents(5200, USD),
      })
      expect(inc.isIncrease).toBe(true)
      expect(inc.isDecrease).toBe(false)

      const dec = makePH({
        oldCost: Money.fromCents(5000, USD),
        newCost: Money.fromCents(4500, USD),
      })
      expect(dec.isDecrease).toBe(true)
      expect(dec.isIncrease).toBe(false)
    })
  })

  describe("immutability", () => {
    it("has no update / softDelete methods exposed", () => {
      const ph = makePH()
      // Compile-time the entity has no `softDelete` / `updateDetails`;
      // verifying at runtime that the prototype carries no such method.
      expect(
        (ph as unknown as Record<string, unknown>).softDelete,
      ).toBeUndefined()
      expect(
        (ph as unknown as Record<string, unknown>).updateDetails,
      ).toBeUndefined()
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields including computed percentage", () => {
      const ph = makePH({
        changeReason: "Cost increase",
        notes: "From email 2026-04-15",
        changedBy: ProfileId.fromPersistence(ACTOR_UUID),
      })
      const snap = ph.toJSON()
      expect(PriceHistory.fromJSON(snap).toJSON()).toEqual(snap)
    })

    it("first-ever record round-trips with null oldCost / null percentage", () => {
      const ph = makePH({ oldCost: null })
      const snap = ph.toJSON()
      expect(snap.oldCost).toBeNull()
      expect(snap.priceChangePercentage).toBeNull()
      expect(PriceHistory.fromJSON(snap).toJSON()).toEqual(snap)
    })
  })
})
