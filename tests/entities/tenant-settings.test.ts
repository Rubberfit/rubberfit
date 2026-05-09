import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { TenantSettings } from "@/src/entities/tenant-settings"
import { Currency } from "@/src/entities/value-objects/currency"
import { ProfileId, TenantId } from "@/src/entities/value-objects/id"

const TENANT_UUID = "550e8400-e29b-41d4-a716-446655440000"
const ACTOR_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")

const USD = Currency.create("USD")
const EUR = Currency.create("EUR")

function makeSettings(
  overrides: Partial<Parameters<typeof TenantSettings.create>[0]> = {},
) {
  return TenantSettings.create(
    {
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      ...overrides,
    },
    T0,
  )
}

describe("TenantSettings", () => {
  describe("create()", () => {
    it("applies sensible defaults", () => {
      const s = makeSettings()
      expect(s.tenantId.value).toBe(TENANT_UUID)
      expect(s.defaultCurrency.value).toBe("USD")
      expect(s.unitSystem).toBe("metric")
      expect(s.dateFormat).toBe("MM/DD/YYYY")
      expect(s.timezone).toBe("America/New_York")
      expect(s.inventorySettings).toEqual({})
      expect(s.updatedBy).toBeNull()
    })

    it("accepts overrides", () => {
      const s = makeSettings({
        defaultCurrency: EUR,
        unitSystem: "imperial",
        dateFormat: "DD/MM/YYYY",
        timezone: "Europe/Berlin",
        inventorySettings: { autoReorderEnabled: true },
      })
      expect(s.defaultCurrency.value).toBe("EUR")
      expect(s.unitSystem).toBe("imperial")
      expect(s.dateFormat).toBe("DD/MM/YYYY")
      expect(s.timezone).toBe("Europe/Berlin")
      expect(s.inventorySettings.autoReorderEnabled).toBe(true)
    })

    it("rejects empty dateFormat", () => {
      expect(() => makeSettings({ dateFormat: "" })).toThrow(InvalidEntityError)
    })

    it("rejects empty timezone", () => {
      expect(() => makeSettings({ timezone: "" })).toThrow(InvalidEntityError)
    })

    it("rejects overlong dateFormat", () => {
      expect(() => makeSettings({ dateFormat: "x".repeat(21) })).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects overlong timezone", () => {
      expect(() => makeSettings({ timezone: "x".repeat(51) })).toThrow(
        InvalidEntityError,
      )
    })

    it("does NOT have a separate id field", () => {
      const s = makeSettings()
      // tenantId is the entity identity
      expect("id" in s).toBe(false)
    })
  })

  describe("updateLocalization()", () => {
    it("updates all four fields and bumps audit", () => {
      const s = makeSettings()
      s.updateLocalization(
        EUR,
        "imperial",
        "DD/MM/YYYY",
        "Europe/London",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.defaultCurrency.value).toBe("EUR")
      expect(s.unitSystem).toBe("imperial")
      expect(s.dateFormat).toBe("DD/MM/YYYY")
      expect(s.timezone).toBe("Europe/London")
      expect(s.updatedAt).toEqual(T1)
      expect(s.updatedBy?.value).toBe(ACTOR_UUID)
    })

    it("no-op on full equality (same values)", () => {
      const s = makeSettings()
      const before = s.updatedAt
      s.updateLocalization(
        USD,
        "metric",
        "MM/DD/YYYY",
        "America/New_York",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.updatedAt).toBe(before)
    })

    it("rejects invalid dateFormat", () => {
      const s = makeSettings()
      expect(() =>
        s.updateLocalization(
          USD,
          "metric",
          "",
          "America/New_York",
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("updateInventorySettings()", () => {
    it("replaces wholesale", () => {
      const s = makeSettings({
        inventorySettings: { defaultLowStockThresholdMm: 100 },
      })
      s.updateInventorySettings(
        { autoReorderEnabled: true },
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.inventorySettings.autoReorderEnabled).toBe(true)
      // Old field is gone — wholesale replace, not merge
      expect(s.inventorySettings.defaultLowStockThresholdMm).toBeUndefined()
    })

    it("no-op on shape equality", () => {
      const s = makeSettings({
        inventorySettings: { defaultLowStockThresholdMm: 100 },
      })
      const before = s.updatedAt
      s.updateInventorySettings(
        { defaultLowStockThresholdMm: 100 },
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.updatedAt).toBe(before)
    })

    it("input is defensively copied (mutating after doesn't leak in)", () => {
      const input = { defaultLowStockThresholdMm: 50 }
      const s = makeSettings()
      s.updateInventorySettings(
        input,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      input.defaultLowStockThresholdMm = 999
      expect(s.inventorySettings.defaultLowStockThresholdMm).toBe(50)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields", () => {
      const original = makeSettings({
        defaultCurrency: EUR,
        inventorySettings: { autoReorderEnabled: true, defaultLeadTimeDays: 7 },
      })
      original.updateLocalization(
        EUR,
        "imperial",
        "DD/MM/YYYY",
        "Europe/Berlin",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      const snapshot = original.toJSON()
      expect(TenantSettings.fromJSON(snapshot).toJSON()).toEqual(snapshot)
    })

    it("snapshot field types are primitives", () => {
      const s = makeSettings()
      const out = s.toJSON()
      expect(typeof out.tenantId).toBe("string")
      expect(typeof out.defaultCurrency).toBe("string")
      expect(typeof out.createdAt).toBe("string")
      // No `id` field in the snapshot
      expect("id" in out).toBe(false)
    })

    it("snapshot inventorySettings is a copy", () => {
      const s = makeSettings({
        inventorySettings: { autoReorderEnabled: false },
      })
      const out = s.toJSON()
      out.inventorySettings.autoReorderEnabled = true
      expect(s.inventorySettings.autoReorderEnabled).toBe(false)
    })
  })
})
