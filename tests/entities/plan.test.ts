import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Plan } from "@/src/entities/plan"
import { Currency } from "@/src/entities/value-objects/currency"
import { PlanId, ProfileId } from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"

const PLAN_UUID = "550e8400-e29b-41d4-a716-446655440000"
const ACTOR_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
const OTHER_ACTOR_UUID = "00000000-0000-4000-8000-000000000001"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

const USD = Currency.create("USD")
const EUR = Currency.create("EUR")

function makePlan(overrides: Partial<Parameters<typeof Plan.create>[0]> = {}) {
  return Plan.create(
    {
      id: PlanId.fromPersistence(PLAN_UUID),
      code: "pro",
      name: "Pro",
      price: Money.fromCents(4900, USD),
      billingInterval: "month",
      ...overrides,
    },
    T0,
  )
}

describe("Plan", () => {
  describe("create()", () => {
    it("constructs with required fields and sensible defaults", () => {
      const p = makePlan()
      expect(p.id.value).toBe(PLAN_UUID)
      expect(p.code).toBe("pro")
      expect(p.name).toBe("Pro")
      expect(p.price.cents).toBe(4900)
      expect(p.price.currency.value).toBe("USD")
      expect(p.billingInterval).toBe("month")
      expect(p.description).toBeNull()
      expect(p.stripePriceId).toBeNull()
      expect(p.seatLimit).toBeNull()
      expect(p.isActive).toBe(true)
      expect(p.isPublic).toBe(true)
      expect(p.sortOrder).toBe(0)
      expect(p.features).toEqual([])
      expect(p.deletedAt).toBeNull()
      expect(p.updatedBy).toBeNull()
    })

    it("trims the name", () => {
      expect(makePlan({ name: "  Pro  " }).name).toBe("Pro")
    })

    it("rejects empty name", () => {
      expect(() => makePlan({ name: "   " })).toThrow(InvalidEntityError)
    })

    it("rejects name longer than 200 chars", () => {
      expect(() => makePlan({ name: "x".repeat(201) })).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects negative price", () => {
      expect(() =>
        makePlan({ price: Money.fromCents(-1, USD) }),
      ).toThrow(InvalidEntityError)
    })

    it("rejects non-positive seatLimit", () => {
      expect(() => makePlan({ seatLimit: 0 })).toThrow(InvalidEntityError)
      expect(() => makePlan({ seatLimit: -5 })).toThrow(InvalidEntityError)
    })

    it("rejects fractional seatLimit", () => {
      expect(() => makePlan({ seatLimit: 5.5 })).toThrow(InvalidEntityError)
    })

    it("trims the description; empty string becomes null", () => {
      expect(makePlan({ description: "  hello  " }).description).toBe("hello")
      expect(makePlan({ description: "   " }).description).toBeNull()
    })
  })

  describe("state queries", () => {
    it("active + not deleted: isAvailable=true", () => {
      expect(makePlan().isAvailable).toBe(true)
    })

    it("inactive: isAvailable=false", () => {
      const p = makePlan()
      p.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.isAvailable).toBe(false)
    })

    it("deleted: isAvailable=false, isDeleted=true", () => {
      const p = makePlan()
      p.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.isDeleted).toBe(true)
      expect(p.isAvailable).toBe(false)
    })

    it("hasFeature checks the features list", () => {
      const p = makePlan({ features: ["multi-tenant", "sso"] })
      expect(p.hasFeature("sso")).toBe(true)
      expect(p.hasFeature("audit-logs")).toBe(false)
    })
  })

  describe("rename()", () => {
    it("updates name and bumps audit", () => {
      const p = makePlan()
      p.rename("Pro Plus", ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.name).toBe("Pro Plus")
      expect(p.updatedAt).toEqual(T1)
      expect(p.updatedBy?.value).toBe(ACTOR_UUID)
    })

    it("no-op on same name", () => {
      const p = makePlan()
      const before = p.updatedAt
      p.rename("Pro", ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.updatedAt).toBe(before)
      expect(p.updatedBy).toBeNull()
    })

    it("rejects on a deleted plan", () => {
      const p = makePlan()
      p.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        p.rename("X", ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("updatePricing()", () => {
    it("changes price + billingInterval together; one audit bump", () => {
      const p = makePlan()
      p.updatePricing(
        Money.fromCents(5900, USD),
        "year",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(p.price.cents).toBe(5900)
      expect(p.billingInterval).toBe("year")
      expect(p.updatedAt).toEqual(T1)
    })

    it("no-op when both unchanged", () => {
      const p = makePlan()
      const before = p.updatedAt
      p.updatePricing(
        Money.fromCents(4900, USD),
        "month",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(p.updatedAt).toBe(before)
    })

    it("changes currency", () => {
      const p = makePlan()
      p.updatePricing(
        Money.fromCents(4500, EUR),
        "month",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(p.price.currency.value).toBe("EUR")
    })

    it("rejects negative price", () => {
      const p = makePlan()
      expect(() =>
        p.updatePricing(
          Money.fromCents(-1, USD),
          "month",
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("setVisibility() + activate/deactivate shortcuts", () => {
    it("setVisibility: aggregated, one audit event", () => {
      const p = makePlan()
      p.setVisibility(false, false, 5, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.isActive).toBe(false)
      expect(p.isPublic).toBe(false)
      expect(p.sortOrder).toBe(5)
      expect(p.updatedAt).toEqual(T1)
    })

    it("setVisibility: no-op on full equality", () => {
      const p = makePlan() // isActive=true, isPublic=true, sortOrder=0
      const before = p.updatedAt
      p.setVisibility(true, true, 0, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.updatedAt).toBe(before)
    })

    it("setVisibility rejects non-integer sortOrder", () => {
      const p = makePlan()
      expect(() =>
        p.setVisibility(
          true,
          true,
          1.5,
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("activate: sets isActive=true; preserves isPublic + sortOrder", () => {
      const p = makePlan({ isActive: false, isPublic: false, sortOrder: 3 })
      p.activate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.isActive).toBe(true)
      expect(p.isPublic).toBe(false) // unchanged
      expect(p.sortOrder).toBe(3) // unchanged
    })

    it("activate: idempotent if already active", () => {
      const p = makePlan()
      const before = p.updatedAt
      p.activate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.updatedAt).toBe(before)
    })

    it("deactivate: sets isActive=false; preserves rest", () => {
      const p = makePlan({ isPublic: true, sortOrder: 2 })
      p.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.isActive).toBe(false)
      expect(p.isPublic).toBe(true)
      expect(p.sortOrder).toBe(2)
    })
  })

  describe("setSeatLimit()", () => {
    it("sets a positive integer", () => {
      const p = makePlan()
      p.setSeatLimit(10, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.seatLimit).toBe(10)
    })

    it("null clears the limit", () => {
      const p = makePlan({ seatLimit: 5 })
      p.setSeatLimit(null, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.seatLimit).toBeNull()
    })

    it("rejects non-positive integers", () => {
      const p = makePlan()
      expect(() =>
        p.setSeatLimit(0, ProfileId.fromPersistence(ACTOR_UUID), T1),
      ).toThrow(InvalidEntityError)
    })

    it("no-op on equal value", () => {
      const p = makePlan({ seatLimit: 5 })
      const before = p.updatedAt
      p.setSeatLimit(5, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.updatedAt).toBe(before)
    })
  })

  describe("updateFeatures()", () => {
    it("replaces the features list", () => {
      const p = makePlan({ features: ["a"] })
      p.updateFeatures(["b", "c"], ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.features).toEqual(["b", "c"])
    })

    it("no-op on set equality (different order, same set)", () => {
      const p = makePlan({ features: ["a", "b"] })
      const before = p.updatedAt
      p.updateFeatures(["b", "a"], ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.updatedAt).toBe(before)
    })
  })

  describe("linkStripePrice()", () => {
    it("sets the Stripe price id", () => {
      const p = makePlan()
      p.linkStripePrice(
        "price_ABC",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(p.stripePriceId).toBe("price_ABC")
    })

    it("null clears", () => {
      const p = makePlan({ stripePriceId: "price_XYZ" })
      p.linkStripePrice(null, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.stripePriceId).toBeNull()
    })
  })

  describe("softDelete()", () => {
    it("flips isActive and stamps deletedAt", () => {
      const p = makePlan() // isActive=true
      p.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(p.isActive).toBe(false) // flipped
      expect(p.deletedAt).toEqual(T1)
      expect(p.isDeleted).toBe(true)
    })

    it("idempotent on second call", () => {
      const p = makePlan()
      p.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      p.softDelete(ProfileId.fromPersistence(OTHER_ACTOR_UUID), T2)
      expect(p.deletedAt).toEqual(T1)
      expect(p.updatedBy?.value).toBe(ACTOR_UUID)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields", () => {
      const original = makePlan({
        description: "Pro tier with all features",
        seatLimit: 25,
        stripePriceId: "price_XYZ",
        features: ["sso", "audit-logs"],
        sortOrder: 2,
      })
      original.updatePricing(
        Money.fromCents(7900, USD),
        "year",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      const snapshot = original.toJSON()
      expect(Plan.fromJSON(snapshot).toJSON()).toEqual(snapshot)
    })

    it("snapshot price is the structured Money shape", () => {
      const p = makePlan()
      const s = p.toJSON()
      expect(s.price).toEqual({ cents: 4900, currency: "USD" })
    })
  })
})
