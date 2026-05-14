/**
 * Service-level coverage for UserPreferencesService.
 *
 * Pins:
 *  - getForUser round-trips the row through snake→camel mapper.
 *  - getForUser throws when no row exists (the profiles INSERT trigger
 *    should auto-provision, but failures must be visible).
 *  - Mapper handles non-round-trip NUMERIC strings without precision loss.
 *  - Mapper throws on non-finite NUMERIC values.
 *  - updateForUser maps a partial update + returns the canonical row.
 *  - updateForUser throws when the chain returns no row (RLS-rejected).
 */
import { describe, expect, it, vi, beforeEach } from "vitest"

import { makeFakeClient } from "../helpers/fake-supabase-client"

const getDatabaseClient = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/supabase/get-database-client", () => ({
  getDatabaseClient,
}))

import { UserPreferencesService } from "@/src/infrastructure/services/userPreferencesService"

const USER_ID = "00000000-0000-0000-0000-000000000001"

const ROW = {
  user_id: USER_ID,
  default_currency: "USD",
  time_zone: "America/Chicago",
  date_format: "MM/dd/yyyy",
  unit_system: "imperial",
  low_stock_threshold_sqft: "50.00",
  locale: "en-US",
  created_at: "2026-05-14T00:00:00Z",
  updated_at: "2026-05-14T00:00:00Z",
}

const UPDATED_ROW = {
  ...ROW,
  locale: "es-MX",
  default_currency: "EUR",
  updated_at: "2026-05-14T01:00:00Z",
}

describe("UserPreferencesService", () => {
  beforeEach(() => {
    getDatabaseClient.mockReset()
  })

  describe("getForUser", () => {
    it("returns the row mapped into the canonical camelCase shape", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({ tables: { user_preferences: { select: { data: ROW, error: null } } } })
      )
      const svc = new UserPreferencesService()
      const result = await svc.getForUser(USER_ID)

      expect(result.userId).toBe(USER_ID)
      expect(result.defaultCurrency).toBe("USD")
      expect(result.timeZone).toBe("America/Chicago")
      expect(result.dateFormat).toBe("MM/dd/yyyy")
      expect(result.unitSystem).toBe("imperial")
      expect(result.lowStockThresholdSqft).toBe(50)
      expect(result.locale).toBe("en-US")
    })

    it("parses non-round-trip numeric strings from Postgres NUMERIC without precision loss", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({
          tables: {
            user_preferences: {
              select: { data: { ...ROW, low_stock_threshold_sqft: "49.73" }, error: null },
            },
          },
        })
      )
      const svc = new UserPreferencesService()
      const result = await svc.getForUser(USER_ID)
      expect(result.lowStockThresholdSqft).toBeCloseTo(49.73, 5)
    })

    it("throws when the threshold column comes back as a non-finite value", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({
          tables: {
            user_preferences: {
              select: { data: { ...ROW, low_stock_threshold_sqft: "NaN" }, error: null },
            },
          },
        })
      )
      const svc = new UserPreferencesService()
      await expect(svc.getForUser(USER_ID)).rejects.toThrow(/not a finite number/)
    })

    it("throws when no row exists for the user", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({ tables: { user_preferences: { select: { data: null, error: null } } } })
      )
      const svc = new UserPreferencesService()
      await expect(svc.getForUser(USER_ID)).rejects.toThrow(/No user_preferences row/)
    })
  })

  describe("updateForUser", () => {
    it("maps a partial update through and returns the canonical row", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({ tables: { user_preferences: { update: { data: UPDATED_ROW, error: null } } } })
      )
      const svc = new UserPreferencesService()
      const result = await svc.updateForUser(USER_ID, {
        defaultCurrency: "EUR",
        locale: "es-MX",
      })

      expect(result.defaultCurrency).toBe("EUR")
      expect(result.locale).toBe("es-MX")
      expect(result.lowStockThresholdSqft).toBe(50)
    })

    it("throws when RLS blocks the write and the chain returns no row", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({ tables: { user_preferences: { update: { data: null, error: null } } } })
      )
      const svc = new UserPreferencesService()
      await expect(
        svc.updateForUser(USER_ID, { defaultCurrency: "EUR" })
      ).rejects.toThrow(/returned no row/)
    })
  })
})
