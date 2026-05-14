/**
 * Action-level coverage for organization-preferences actions.
 *
 * Pins (per the 2026-05-14 operator-seeds-prints ruling):
 *  - Recovery-exempt: no `requireActiveSubscription` gate (dashboard
 *    layout + billing landing fetch this on every render).
 *  - Read returns `{ error: "no_organization" }` when the actor has
 *    no active org; surfaces `{ error: "not_provisioned" }` when the
 *    provision trigger somehow didn't fire so the layout can fall
 *    back to defaults rather than crash.
 *  - Update is owner/admin only (RLS is the second guard).
 *  - Update revalidates `/dashboard/settings/general`.
 *  - Update rejects invalid input via Zod before reaching the service.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"
import type { OrganizationPreferences } from "@/src/infrastructure/models/organization-preferences"
import type { Organization } from "@/src/infrastructure/models/billing"

const requireAuthenticatedUserMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const getCurrentOrganizationForUserMock = vi.hoisted(() => vi.fn())
const getMemberRoleMock = vi.hoisted(() => vi.fn())
const getForOrganizationMock = vi.hoisted(() => vi.fn())
const updateForOrganizationMock = vi.hoisted(() => vi.fn())

const resolveUseCaseMock = vi.hoisted(() => vi.fn())
vi.mock("@/di/resolve", () => ({
  resolveUseCase: resolveUseCaseMock,
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-0000-0000-0000000000aa",
  email: "owner@example.com",
  roles: ["admin"],
  isSuperAdmin: false,
}

const ORG_ID = "11111111-1111-1111-1111-111111111111"

const ORG: Organization = {
  id: ORG_ID,
  name: "Test Org",
  billing_email: null,
  stripe_customer_id: null,
  created_by: ACTOR.id,
  created_at: "2026-05-12T00:00:00Z",
  updated_at: "2026-05-12T00:00:00Z",
}

const PREFS: OrganizationPreferences = {
  organizationId: ORG_ID,
  defaultCurrency: "USD",
  timeZone: "America/Chicago",
  dateFormat: "MM/dd/yyyy",
  unitSystem: "imperial",
  lowStockThresholdSqft: 50,
  locale: "en-US",
  createdAt: "2026-05-14T00:00:00Z",
  updatedAt: "2026-05-14T00:00:00Z",
}

import {
  getOrganizationPreferences,
  updateOrganizationPreferences,
} from "@/app/actions/organization-preferences"

describe("app/actions/organization-preferences", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    getCurrentOrganizationForUserMock.mockResolvedValue(ORG)
    getMemberRoleMock.mockResolvedValue("admin")
    getForOrganizationMock.mockResolvedValue(PREFS)
    updateForOrganizationMock.mockResolvedValue(PREFS)
    resolveUseCaseMock.mockImplementation(() => ({
      getCurrentOrganizationForUser: getCurrentOrganizationForUserMock,
      getMemberRole: getMemberRoleMock,
      getForOrganization: getForOrganizationMock,
      updateForOrganization: updateForOrganizationMock,
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("getOrganizationPreferences", () => {
    it("returns the org's preferences when everything is wired", async () => {
      const result = await getOrganizationPreferences()
      expect(result).toEqual({ data: PREFS })
      expect(ensureDatabaseFactoryRegisteredMock).toHaveBeenCalled()
    })

    it("returns no_organization when the actor has no current org", async () => {
      getCurrentOrganizationForUserMock.mockResolvedValueOnce(null)
      const result = await getOrganizationPreferences()
      expect(result).toEqual({ error: "no_organization" })
    })

    it("returns not_provisioned when the provision trigger hasn't fired", async () => {
      getForOrganizationMock.mockRejectedValueOnce(
        new Error(`No organization_preferences row for organization ${ORG_ID}`)
      )
      const result = await getOrganizationPreferences()
      expect(result).toEqual({ error: "not_provisioned" })
    })

    it("rethrows unexpected service errors", async () => {
      getForOrganizationMock.mockRejectedValueOnce(new Error("network exploded"))
      await expect(getOrganizationPreferences()).rejects.toThrow(/network exploded/)
    })
  })

  describe("updateOrganizationPreferences", () => {
    it("accepts admin callers and revalidates the settings page", async () => {
      const result = await updateOrganizationPreferences({ locale: "es-MX" })
      expect(result).toEqual({ data: PREFS })
      expect(updateForOrganizationMock).toHaveBeenCalledWith(ORG_ID, { locale: "es-MX" })
      expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/settings/general")
    })

    it("accepts owner callers", async () => {
      getMemberRoleMock.mockResolvedValueOnce("owner")
      const result = await updateOrganizationPreferences({ defaultCurrency: "EUR" })
      expect(result).toEqual({ data: PREFS })
    })

    it("rejects non-admin callers with forbidden", async () => {
      getMemberRoleMock.mockResolvedValueOnce("member")
      const result = await updateOrganizationPreferences({ locale: "es-MX" })
      expect(result).toEqual({ error: "forbidden" })
      expect(updateForOrganizationMock).not.toHaveBeenCalled()
    })

    it("rejects callers with no role at all", async () => {
      getMemberRoleMock.mockResolvedValueOnce(null)
      const result = await updateOrganizationPreferences({ locale: "es-MX" })
      expect(result).toEqual({ error: "forbidden" })
    })

    it("returns no_organization when the actor has no current org", async () => {
      getCurrentOrganizationForUserMock.mockResolvedValueOnce(null)
      const result = await updateOrganizationPreferences({ locale: "es-MX" })
      expect(result).toEqual({ error: "no_organization" })
      expect(updateForOrganizationMock).not.toHaveBeenCalled()
    })

    it("returns invalid when input fails zod parsing", async () => {
      const result = await updateOrganizationPreferences({
        // @ts-expect-error — deliberate invalid input
        locale: "fr-FR",
      })
      if (!("error" in result)) throw new Error("expected error envelope")
      expect(result.error).toBe("invalid")
      expect(updateForOrganizationMock).not.toHaveBeenCalled()
    })

    it("rejects negative threshold values", async () => {
      const result = await updateOrganizationPreferences({ lowStockThresholdSqft: -1 })
      if (!("error" in result)) throw new Error("expected error envelope")
      expect(result.error).toBe("invalid")
    })
  })
})
