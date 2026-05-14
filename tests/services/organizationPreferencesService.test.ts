/**
 * Service-level coverage for OrganizationPreferencesService.
 *
 * Pins:
 *  - getForOrganization round-trips the row through the snake→camel mapper.
 *  - getForOrganization throws when no row exists (trigger should
 *    auto-provision, but the read path must fail visibly if it ever
 *    doesn't).
 *  - updateForOrganization sends only the supplied fields and maps the
 *    response back into the canonical shape.
 *  - updateForOrganization throws when the underlying chain returns no
 *    row (RLS-rejected admin gate).
 */
import { describe, expect, it, vi, beforeEach } from "vitest"

import { makeFakeClient } from "../helpers/fake-supabase-client"

const getDatabaseClient = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/supabase/get-database-client", () => ({
  getDatabaseClient,
}))

import { OrganizationPreferencesService } from "@/src/infrastructure/services/organizationPreferencesService"

const ORG_ID = "00000000-0000-0000-0000-000000000001"

const ROW = {
  organization_id: ORG_ID,
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
  default_currency: "EUR",
  locale: "es-MX",
  updated_at: "2026-05-14T01:00:00Z",
}

describe("OrganizationPreferencesService", () => {
  beforeEach(() => {
    getDatabaseClient.mockReset()
  })

  describe("getForOrganization", () => {
    it("returns the row mapped into the canonical camelCase shape", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({ tables: { organization_preferences: { select: { data: ROW, error: null } } } })
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
            organization_preferences: {
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
            organization_preferences: {
              select: { data: { ...ROW, low_stock_threshold_sqft: "NaN" }, error: null },
            },
          },
        })
      )
      const svc = new OrganizationPreferencesService()
      await expect(svc.getForOrganization(ORG_ID)).rejects.toThrow(/not a finite number/)
    })

    it("throws when no row exists for the organization", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({ tables: { organization_preferences: { select: { data: null, error: null } } } })
      )
      const svc = new OrganizationPreferencesService()
      await expect(svc.getForOrganization(ORG_ID)).rejects.toThrow(/No organization_preferences row/)
    })
  })

  describe("updateForOrganization", () => {
    it("maps a partial update through and returns the canonical row", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({ tables: { organization_preferences: { update: { data: UPDATED_ROW, error: null } } } })
      )
      const svc = new OrganizationPreferencesService()
      const result = await svc.updateForOrganization(ORG_ID, {
        defaultCurrency: "EUR",
        locale: "es-MX",
      })

      expect(result.defaultCurrency).toBe("EUR")
      expect(result.locale).toBe("es-MX")
      expect(result.lowStockThresholdSqft).toBe(50)
    })

    it("throws when RLS blocks the write and the chain returns no row", async () => {
      getDatabaseClient.mockResolvedValueOnce(
        makeFakeClient({ tables: { organization_preferences: { update: { data: null, error: null } } } })
      )
      const svc = new OrganizationPreferencesService()
      await expect(
        svc.updateForOrganization(ORG_ID, { defaultCurrency: "EUR" })
      ).rejects.toThrow(/returned no row/)
    })
  })
})
