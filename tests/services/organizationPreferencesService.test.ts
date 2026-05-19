/**
 * Service-level coverage for OrganizationPreferencesService.
 *
 * Service retargeted at `tenant_settings` post-DDD merge; the row
 * shape uses `tenant_id` and `timezone` (no underscore), and the
 * not-found error references `tenant_settings`. Pins:
 *  - getForOrganization round-trips the row through snake→camel mapper.
 *  - getForOrganization throws when no row exists (provision trigger
 *    should auto-insert one on org create, but failures must be visible).
 *  - Mapper handles non-round-trip NUMERIC strings without precision loss.
 *  - Mapper throws on non-finite NUMERIC values.
 *  - updateForOrganization maps a partial update + returns the canonical row.
 *  - updateForOrganization throws when the chain returns no row (RLS-rejected).
 */
import { describe, expect, it, vi, beforeEach } from "vitest"

import { makeFakeClient } from "../helpers/fake-supabase-client"

const getDatabaseClient = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/supabase/get-database-client", () => ({
  getDatabaseClient,
}))

import { OrganizationPreferencesService } from "@/src/infrastructure/services/organizationPreferencesService"

const ORG_ID = "11111111-1111-1111-1111-111111111111"

const ROW = {
  tenant_id: ORG_ID,
  default_currency: "USD",
  timezone: "America/Chicago",
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
  date_format: "dd/MM/yyyy",
  updated_at: "2026-05-14T01:00:00Z",
}

describe("OrganizationPreferencesService", () => {
  beforeEach(() => {
    getDatabaseClient.mockReset()
  })

  describe("getForOrganization", () => {
    it("returns the row mapped into the canonical camelCase shape", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({
          tables: { tenant_settings: { select: { data: ROW, error: null } } },
        })
      )
      const svc = new OrganizationPreferencesService()
      const result = await svc.getForOrganization(ORG_ID)

      expect(result.organizationId).toBe(ORG_ID)
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
            tenant_settings: {
              select: { data: { ...ROW, low_stock_threshold_sqft: "49.73" }, error: null },
            },
          },
        })
      )
      const svc = new OrganizationPreferencesService()
      const result = await svc.getForOrganization(ORG_ID)
      expect(result.lowStockThresholdSqft).toBeCloseTo(49.73, 5)
    })

    it("throws when the threshold column comes back as a non-finite value", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({
          tables: {
            tenant_settings: {
              select: { data: { ...ROW, low_stock_threshold_sqft: "NaN" }, error: null },
            },
          },
        })
      )
      const svc = new OrganizationPreferencesService()
      await expect(svc.getForOrganization(ORG_ID)).rejects.toThrow(/not a finite number/)
    })

    it("throws when no row exists for the org", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({
          tables: { tenant_settings: { select: { data: null, error: null } } },
        })
      )
      const svc = new OrganizationPreferencesService()
      await expect(svc.getForOrganization(ORG_ID)).rejects.toThrow(/No tenant_settings row/)
    })
  })

  describe("updateForOrganization", () => {
    it("maps a partial update through and returns the canonical row", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({
          tables: { tenant_settings: { update: { data: UPDATED_ROW, error: null } } },
        })
      )
      const svc = new OrganizationPreferencesService()
      const result = await svc.updateForOrganization(ORG_ID, {
        defaultCurrency: "EUR",
        locale: "es-MX",
        dateFormat: "dd/MM/yyyy",
      })

      expect(result.defaultCurrency).toBe("EUR")
      expect(result.locale).toBe("es-MX")
      expect(result.dateFormat).toBe("dd/MM/yyyy")
    })

    it("throws when RLS blocks the write and the chain returns no row", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({
          tables: { tenant_settings: { update: { data: null, error: null } } },
        })
      )
      const svc = new OrganizationPreferencesService()
      await expect(svc.updateForOrganization(ORG_ID, { defaultCurrency: "EUR" })).rejects.toThrow(
        /returned no row/
      )
    })
  })
})
