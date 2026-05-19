/**
 * Material-type action tests.
 *
 * What we're enforcing:
 *   - manageMaterialTypes permission required (V4.2).
 *   - active tenant required (server-action context cannot fall back
 *     to a browser-side current-user lookup).
 *   - Field surface narrowing on update: only {name, description,
 *     minStockSqm} flow through; client cannot smuggle id / user_id
 *     / created_at / updated_at.
 *   - delete is now soft-delete via the entity-typed service; FK
 *     guards still short-circuit BEFORE the soft-delete call so the
 *     UI can surface a specific "in use" reason code.
 *   - actor.id is threaded into create as `createdBy` (entity-typed
 *     service requires the audit field at insert).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"
import {
  DEFAULT_ORGANIZATION_PREFERENCES,
  type OrganizationPreferences,
} from "@/src/infrastructure/models/organization-preferences"
import { SQFT_PER_SQM } from "@/src/application/use-cases/purchase-orders/po-input-conversion"
import { TOKENS } from "@/di/tokens"

const requireAuthenticatedUserMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

const requireActiveSubscriptionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-active-subscription", () => ({
  requireActiveSubscription: requireActiveSubscriptionMock,
}))

const requireActiveTenantMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-active-tenant", () => ({
  requireActiveTenant: requireActiveTenantMock,
}))

const requirePermissionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-permission", () => ({
  requirePermission: requirePermissionMock,
}))

const orgPrefsGetForOrganizationMock = vi.hoisted(() =>
  vi.fn<(orgId: string) => Promise<OrganizationPreferences>>()
)
const orgPrefsServiceMock = vi.hoisted(() => ({
  getForOrganization: orgPrefsGetForOrganizationMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const createSvcMock = vi.hoisted(() => vi.fn())
const updateSvcMock = vi.hoisted(() => vi.fn())
const softDeleteSvcMock = vi.hoisted(() => vi.fn())
const getByIdSvcMock = vi.hoisted(() => vi.fn())
const getByIdsSvcMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/materialTypeService", () => ({
  materialTypeService: {
    createMaterialType: createSvcMock,
    updateMaterialType: updateSvcMock,
    softDeleteMaterialType: softDeleteSvcMock,
    getById: getByIdSvcMock,
    getByIds: getByIdsSvcMock,
  },
}))

const existsByMaterialTypeMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/rollService", () => ({
  rollService: {
    existsByMaterialType: existsByMaterialTypeMock,
  },
}))

// Entity-typed IPurchaseOrderService is resolved via DI; mock the
// resolver to return a fake with the FK-probe method.
const existsActiveItemsByMaterialTypeMock = vi.hoisted(() => vi.fn())
const resolveServiceMock = vi.hoisted(() => vi.fn())
vi.mock("@/di/resolve", () => ({
  resolveService: resolveServiceMock,
  resolveUseCase: vi.fn(),
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

const TENANT_ID = "00000000-0000-0000-0000-0000000000bb"

const ACTOR: ActionActor = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "manager@example.com",
  roles: ["manager"],
  isSuperAdmin: false,
  activeTenantId: TENANT_ID,
}

const MATERIAL_ID = "00000000-0000-0000-0000-000000000aaa"
const ORG_ID = "00000000-0000-0000-0000-0000000000aa"

// Stand-in for a MaterialType entity. The action only calls .toJSON()
// on the returned value (to shape the action return), and the entity
// getter `.name` is used by the FK pre-flight check, so a plain
// object satisfies both shapes.
const FAKE_ENTITY = {
  name: "Butyl",
  description: null,
  minStockSqm: null,
  toJSON: () => ({
    id: MATERIAL_ID,
    tenantId: TENANT_ID,
    name: "Butyl",
    description: null,
    minStockSqm: null,
    createdAt: "2026-05-15T00:00:00.000Z",
    createdBy: ACTOR.id,
    updatedAt: "2026-05-15T00:00:00.000Z",
    updatedBy: null,
    deletedAt: null,
  }),
}

function buildOrgPrefs(
  overrides: Partial<OrganizationPreferences> = {}
): OrganizationPreferences {
  return {
    organizationId: ORG_ID,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...DEFAULT_ORGANIZATION_PREFERENCES,
    ...overrides,
  }
}

describe("app/actions/materials", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requireActiveSubscriptionMock.mockResolvedValue({
      kind: "allowed",
      organizationId: ORG_ID,
    })
    requireActiveTenantMock.mockReturnValue(TENANT_ID)
    requirePermissionMock.mockReturnValue(undefined)
    createSvcMock.mockResolvedValue(FAKE_ENTITY)
    updateSvcMock.mockResolvedValue(FAKE_ENTITY)
    softDeleteSvcMock.mockResolvedValue(FAKE_ENTITY)
    getByIdSvcMock.mockResolvedValue(FAKE_ENTITY)
    getByIdsSvcMock.mockResolvedValue([FAKE_ENTITY])
    existsByMaterialTypeMock.mockResolvedValue(false)
    existsActiveItemsByMaterialTypeMock.mockResolvedValue(false)
    orgPrefsGetForOrganizationMock.mockResolvedValue(buildOrgPrefs())
    resolveServiceMock.mockImplementation((token: symbol) => {
      if (token === TOKENS.IOrganizationPreferencesService) return orgPrefsServiceMock
      return {
        existsActiveItemsByMaterialType: existsActiveItemsByMaterialTypeMock,
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── createMaterialType ─────────────────────────────────────────

  it("createMaterialType threads actor.id + tenant and revalidates material paths", async () => {
    const { createMaterialType } = await import("@/app/actions/materials")

    await createMaterialType({
      name: "Butyl",
      description: "Rubber sheet material",
      min_stock_sqm: 50,
    })

    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageMaterialTypes")
    expect(requireActiveTenantMock).toHaveBeenCalledWith(ACTOR)
    expect(createSvcMock).toHaveBeenCalledTimes(1)
    const props = createSvcMock.mock.calls[0][0]
    expect(props.name).toBe("Butyl")
    expect(props.description).toBe("Rubber sheet material")
    expect(props.minStockSqm).toBe(50)
    // tenantId + createdBy come through as value-objects whose `.value`
    // string round-trips the original UUID.
    expect(props.tenantId.value).toBe(TENANT_ID)
    expect(props.createdBy.value).toBe(ACTOR.id)
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/settings/materials")
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory")
  })

  it("createMaterialType rejects empty name", async () => {
    const { createMaterialType } = await import("@/app/actions/materials")

    await expect(createMaterialType({ name: "" })).rejects.toThrow()
    expect(createSvcMock).not.toHaveBeenCalled()
  })

  it("createMaterialType rejects negative min_stock_sqm", async () => {
    const { createMaterialType } = await import("@/app/actions/materials")

    await expect(createMaterialType({ name: "Butyl", min_stock_sqm: -1 })).rejects.toThrow()
    expect(createSvcMock).not.toHaveBeenCalled()
  })

  it("createMaterialType rejects callers without manageMaterialTypes", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })
    const { createMaterialType } = await import("@/app/actions/materials")

    await expect(createMaterialType({ name: "Butyl" })).rejects.toThrow("forbidden")
    expect(createSvcMock).not.toHaveBeenCalled()
  })

  it("createMaterialType seeds minStockSqm from org prefs (sqft→sqm) when omitted", async () => {
    orgPrefsGetForOrganizationMock.mockResolvedValue(
      buildOrgPrefs({ lowStockThresholdSqft: 275 })
    )
    const { createMaterialType } = await import("@/app/actions/materials")

    await createMaterialType({ name: "Butyl" })

    expect(orgPrefsGetForOrganizationMock).toHaveBeenCalledWith(ORG_ID)
    expect(createSvcMock).toHaveBeenCalledWith(
      expect.objectContaining({ minStockSqm: 275 / SQFT_PER_SQM })
    )
  })

  it("createMaterialType preserves an explicit min_stock_sqm: 0 (disable-alerts override)", async () => {
    const { createMaterialType } = await import("@/app/actions/materials")

    await createMaterialType({ name: "Butyl", min_stock_sqm: 0 })

    // Explicit 0 is meaningful — the operator wants no alert. The
    // seed lookup must NOT run, otherwise `?? orgSeed` would replace
    // a legitimate override.
    expect(orgPrefsGetForOrganizationMock).not.toHaveBeenCalled()
    expect(createSvcMock).toHaveBeenCalledWith(
      expect.objectContaining({ minStockSqm: 0 })
    )
  })

  it("createMaterialType falls back to the model default (sqm) when org-prefs lookup fails", async () => {
    orgPrefsGetForOrganizationMock.mockRejectedValue(new Error("rls denied"))
    const { createMaterialType } = await import("@/app/actions/materials")

    await createMaterialType({ name: "Butyl" })

    expect(createSvcMock).toHaveBeenCalledWith(
      expect.objectContaining({
        minStockSqm: DEFAULT_ORGANIZATION_PREFERENCES.lowStockThresholdSqft / SQFT_PER_SQM,
      })
    )
  })

  // ── updateMaterialType ─────────────────────────────────────────

  it("updateMaterialType narrows update surface — no smuggling id/user_id/created_at", async () => {
    const { updateMaterialType } = await import("@/app/actions/materials")

    const maliciousInput = {
      id: MATERIAL_ID,
      name: "Renamed",
      // Extra fields a malicious client might send
      user_id: "different-user",
      created_at: "1970-01-01",
      updated_at: "1970-01-01",
    } as unknown as Parameters<typeof updateMaterialType>[0]

    await updateMaterialType(maliciousInput)

    const [idArg, updates] = updateSvcMock.mock.calls[0]
    expect(idArg).toBe(MATERIAL_ID)
    // The action loads existing values for omitted fields, then sends
    // a whole-record update. Smuggled fields are dropped at the Zod
    // boundary — the entity-typed service only accepts
    // {name, description, minStockSqm}.
    expect(Object.keys(updates).sort()).toEqual(["description", "minStockSqm", "name"])
    expect(updates.name).toBe("Renamed")
    expect(updates).not.toHaveProperty("user_id")
    expect(updates).not.toHaveProperty("created_at")
    expect(updates).not.toHaveProperty("updated_at")
  })

  it("updateMaterialType rejects bad UUID before service call", async () => {
    const { updateMaterialType } = await import("@/app/actions/materials")

    await expect(updateMaterialType({ id: "not-a-uuid", name: "X" })).rejects.toThrow()
    expect(updateSvcMock).not.toHaveBeenCalled()
  })

  it("updateMaterialType allows partial updates (just min_stock_sqm)", async () => {
    const { updateMaterialType } = await import("@/app/actions/materials")

    await updateMaterialType({ id: MATERIAL_ID, min_stock_sqm: 75 })

    const updates = updateSvcMock.mock.calls[0][1]
    expect(updates.minStockSqm).toBe(75)
    // Other fields preserved from the existing entity.
    expect(updates.name).toBe("Butyl")
  })

  // ── deleteMaterialType ─────────────────────────────────────────

  it("deleteMaterialType happy path — guards pass, soft-delete called, revalidate", async () => {
    const { deleteMaterialType } = await import("@/app/actions/materials")

    const result = await deleteMaterialType({ id: MATERIAL_ID })

    expect(getByIdsSvcMock).toHaveBeenCalledWith([MATERIAL_ID])
    expect(existsByMaterialTypeMock).toHaveBeenCalledWith("Butyl")
    expect(existsActiveItemsByMaterialTypeMock).toHaveBeenCalledWith(MATERIAL_ID)
    expect(softDeleteSvcMock).toHaveBeenCalledTimes(1)
    const [idArg, actorArg] = softDeleteSvcMock.mock.calls[0]
    expect(idArg).toBe(MATERIAL_ID)
    expect(actorArg.value).toBe(ACTOR.id)
    expect(result).toEqual({ ok: true })
  })

  it("deleteMaterialType returns not_found when material doesn't exist", async () => {
    getByIdsSvcMock.mockResolvedValue([])
    const { deleteMaterialType } = await import("@/app/actions/materials")

    const result = await deleteMaterialType({ id: MATERIAL_ID })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("not_found")
    }
    expect(softDeleteSvcMock).not.toHaveBeenCalled()
  })

  it("deleteMaterialType returns in_use_by_rolls when rolls exist", async () => {
    existsByMaterialTypeMock.mockResolvedValue(true)
    const { deleteMaterialType } = await import("@/app/actions/materials")

    const result = await deleteMaterialType({ id: MATERIAL_ID })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("in_use_by_rolls")
    }
    // Short-circuits before the PO check or the soft-delete itself
    expect(existsActiveItemsByMaterialTypeMock).not.toHaveBeenCalled()
    expect(softDeleteSvcMock).not.toHaveBeenCalled()
  })

  it("deleteMaterialType returns in_use_by_purchase_orders when PO items exist", async () => {
    existsActiveItemsByMaterialTypeMock.mockResolvedValue(true)
    const { deleteMaterialType } = await import("@/app/actions/materials")

    const result = await deleteMaterialType({ id: MATERIAL_ID })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("in_use_by_purchase_orders")
    }
    expect(softDeleteSvcMock).not.toHaveBeenCalled()
  })

  it("deleteMaterialType returns delete_failed when soft-delete throws", async () => {
    softDeleteSvcMock.mockRejectedValue(new Error("db unavailable"))
    const { deleteMaterialType } = await import("@/app/actions/materials")

    const result = await deleteMaterialType({ id: MATERIAL_ID })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("delete_failed")
    }
  })

  it("deleteMaterialType rejects callers without manageMaterialTypes", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })
    const { deleteMaterialType } = await import("@/app/actions/materials")

    await expect(deleteMaterialType({ id: MATERIAL_ID })).rejects.toThrow("forbidden")
    expect(getByIdsSvcMock).not.toHaveBeenCalled()
    expect(softDeleteSvcMock).not.toHaveBeenCalled()
  })
})
