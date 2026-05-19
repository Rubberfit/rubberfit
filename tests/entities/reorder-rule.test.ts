import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import {
  ReorderRule,
  type ReorderRuleUpdateProps,
} from "@/src/entities/reorder-rule"
import {
  MaterialTypeId,
  ProfileId,
  ReorderRuleId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"

const RR_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const MT_UUID = "00000000-0000-4000-8000-000000000020"
const SUPPLIER_UUID = "00000000-0000-4000-8000-000000000030"
const OTHER_SUPPLIER_UUID = "00000000-0000-4000-8000-000000000031"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000040"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

function makeRule(
  overrides: Partial<Parameters<typeof ReorderRule.create>[0]> = {},
) {
  return ReorderRule.create(
    {
      id: ReorderRuleId.fromPersistence(RR_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      materialTypeId: MaterialTypeId.fromPersistence(MT_UUID),
      supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
      reorderPointSqm: 100,
      reorderQuantitySqm: 500,
      maxStockLevelSqm: 1000,
      ...overrides,
    },
    T0,
  )
}

const baseUpdate: ReorderRuleUpdateProps = {
  supplierId: SupplierId.fromPersistence(SUPPLIER_UUID),
  reorderPointSqm: 100,
  reorderQuantitySqm: 500,
  maxStockLevelSqm: 1000,
  leadTimeDays: 7,
  safetyStockDays: 3,
  notes: null,
}

describe("ReorderRule", () => {
  describe("create()", () => {
    it("constructs with required fields and defaults", () => {
      const r = makeRule()
      expect(r.reorderPointSqm).toBe(100)
      expect(r.reorderQuantitySqm).toBe(500)
      expect(r.maxStockLevelSqm).toBe(1000)
      expect(r.leadTimeDays).toBe(7)
      expect(r.safetyStockDays).toBe(3)
      expect(r.autoReorder).toBe(false)
      expect(r.isActive).toBe(true)
      expect(r.lastTriggeredAt).toBeNull()
    })

    it("accepts a null maxStockLevelSqm", () => {
      const r = makeRule({ maxStockLevelSqm: null })
      expect(r.maxStockLevelSqm).toBeNull()
    })

    it("rejects max <= reorder_point", () => {
      expect(() =>
        makeRule({ reorderPointSqm: 100, maxStockLevelSqm: 100 }),
      ).toThrow(InvalidEntityError)
      expect(() =>
        makeRule({ reorderPointSqm: 100, maxStockLevelSqm: 50 }),
      ).toThrow(InvalidEntityError)
    })

    it("rejects negative reorderPointSqm", () => {
      expect(() => makeRule({ reorderPointSqm: -1 })).toThrow(
        InvalidEntityError,
      )
    })

    it("accepts zero reorderPointSqm", () => {
      const r = makeRule({ reorderPointSqm: 0, maxStockLevelSqm: 100 })
      expect(r.reorderPointSqm).toBe(0)
    })

    it("rejects zero or negative reorderQuantitySqm (DB CHECK is > 0)", () => {
      expect(() => makeRule({ reorderQuantitySqm: 0 })).toThrow(
        InvalidEntityError,
      )
      expect(() => makeRule({ reorderQuantitySqm: -1 })).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects non-integer leadTimeDays / safetyStockDays", () => {
      expect(() => makeRule({ leadTimeDays: 1.5 })).toThrow(InvalidEntityError)
      expect(() => makeRule({ safetyStockDays: 1.5 })).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects negative leadTimeDays / safetyStockDays", () => {
      expect(() => makeRule({ leadTimeDays: -1 })).toThrow(InvalidEntityError)
      expect(() => makeRule({ safetyStockDays: -1 })).toThrow(
        InvalidEntityError,
      )
    })
  })

  describe("updateDetails()", () => {
    it("changes all fields and bumps audit", () => {
      const r = makeRule()
      r.updateDetails(
        {
          ...baseUpdate,
          supplierId: SupplierId.fromPersistence(OTHER_SUPPLIER_UUID),
          reorderPointSqm: 200,
          reorderQuantitySqm: 600,
          maxStockLevelSqm: 2000,
          leadTimeDays: 14,
          safetyStockDays: 5,
          notes: "Quarterly review",
        },
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(r.supplierId?.value).toBe(OTHER_SUPPLIER_UUID)
      expect(r.reorderPointSqm).toBe(200)
      expect(r.maxStockLevelSqm).toBe(2000)
      expect(r.leadTimeDays).toBe(14)
      expect(r.notes).toBe("Quarterly review")
      expect(r.updatedAt).toEqual(T1)
    })

    it("re-checks max > reorder_point on update", () => {
      const r = makeRule()
      expect(() =>
        r.updateDetails(
          { ...baseUpdate, reorderPointSqm: 1500, maxStockLevelSqm: 1000 },
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("no-op on full equality", () => {
      const r = makeRule()
      const before = r.updatedAt
      r.updateDetails(
        baseUpdate,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(r.updatedAt).toBe(before)
    })

    it("does NOT touch autoReorder or isActive", () => {
      const r = makeRule({ autoReorder: true })
      r.updateDetails(
        { ...baseUpdate, reorderPointSqm: 200 },
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(r.autoReorder).toBe(true)
      expect(r.isActive).toBe(true)
    })

    it("rejects on a deleted rule", () => {
      const r = makeRule()
      r.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        r.updateDetails(
          baseUpdate,
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("auto-reorder toggle", () => {
    it("enableAutoReorder flips on; idempotent", () => {
      const r = makeRule()
      r.enableAutoReorder(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(r.autoReorder).toBe(true)
      const before = r.updatedAt
      r.enableAutoReorder(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(r.updatedAt).toBe(before)
    })

    it("disableAutoReorder flips off; idempotent", () => {
      const r = makeRule({ autoReorder: true })
      r.disableAutoReorder(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(r.autoReorder).toBe(false)
      const before = r.updatedAt
      r.disableAutoReorder(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(r.updatedAt).toBe(before)
    })

    it("toggles reject on deleted rule", () => {
      const r = makeRule()
      r.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        r.enableAutoReorder(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("activation toggle", () => {
    it("deactivate / reactivate flip isActive", () => {
      const r = makeRule()
      r.deactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(r.isActive).toBe(false)
      r.reactivate(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(r.isActive).toBe(true)
    })
  })

  describe("recordTrigger()", () => {
    it("bumps lastTriggeredAt only — does NOT bump updatedAt / updatedBy", () => {
      const r = makeRule()
      const beforeUpdatedAt = r.updatedAt
      const beforeUpdatedBy = r.updatedBy
      r.recordTrigger(T1)
      expect(r.lastTriggeredAt).toEqual(T1)
      expect(r.updatedAt).toEqual(beforeUpdatedAt)
      expect(r.updatedBy).toEqual(beforeUpdatedBy)
    })

    it("can be invoked multiple times to advance the timestamp", () => {
      const r = makeRule()
      r.recordTrigger(T1)
      r.recordTrigger(T2)
      expect(r.lastTriggeredAt).toEqual(T2)
    })

    it("rejects on a deleted rule", () => {
      const r = makeRule()
      r.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() => r.recordTrigger(T2)).toThrow(InvalidEntityError)
    })
  })

  describe("softDelete()", () => {
    it("sets deletedAt; idempotent", () => {
      const r = makeRule()
      r.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      r.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(r.deletedAt).toEqual(T1)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields", () => {
      const r = makeRule({ autoReorder: true, notes: "Q4 rule" })
      r.recordTrigger(T1)
      r.updateDetails(
        { ...baseUpdate, reorderPointSqm: 200 },
        ProfileId.fromPersistence(ACTOR_UUID),
        T2,
      )
      const snap = r.toJSON()
      expect(ReorderRule.fromJSON(snap).toJSON()).toEqual(snap)
    })
  })
})
