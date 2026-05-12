/**
 * Material-type action tests.
 *
 * What we're enforcing:
 *   - manageMaterialTypes permission required (V4.2).
 *   - Field surface narrowing on update: only {name, description,
 *     default_cost, min_stock_alert} flow through; client cannot smuggle
 *     id / user_id / created_at / updated_at.
 *   - delete returns typed result with stable reason codes; FK guards
 *     short-circuit BEFORE the delete attempt for clear UX.
 *   - actor.id is threaded into create (the underlying repository's
 *     getCurrentUserId fallback is browser-only and would 42501 in
 *     server-action context).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"

const requireAuthenticatedUserMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

const requirePermissionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-permission", () => ({
  requirePermission: requirePermissionMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const createSvcMock = vi.hoisted(() => vi.fn())
const updateSvcMock = vi.hoisted(() => vi.fn())
const deleteSvcMock = vi.hoisted(() => vi.fn())
const getByIdsSvcMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/legacyMaterialTypeService", () => ({
  legacyMaterialTypeService: {
    create: createSvcMock,
    update: updateSvcMock,
    delete: deleteSvcMock,
    getByIds: getByIdsSvcMock,
  },
}))

const existsByMaterialTypeMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/legacyRollService", () => ({
  legacyRollService: {
    existsByMaterialType: existsByMaterialTypeMock,
  },
}))

const existsItemsByMaterialTypeMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/purchaseOrderService", () => ({
  purchaseOrderService: {
    existsItemsByMaterialType: existsItemsByMaterialTypeMock,
  },
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "manager@example.com",
  roles: ["manager"],
  isSuperAdmin: false,
}

const MATERIAL_ID = "00000000-0000-0000-0000-000000000aaa"

describe("app/actions/materials", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requirePermissionMock.mockReturnValue(undefined)
    createSvcMock.mockResolvedValue({ id: MATERIAL_ID, name: "Butyl" })
    updateSvcMock.mockResolvedValue({ id: MATERIAL_ID, name: "Butyl" })
    deleteSvcMock.mockResolvedValue(undefined)
    getByIdsSvcMock.mockResolvedValue([{ id: MATERIAL_ID, name: "Butyl" }])
    existsByMaterialTypeMock.mockResolvedValue(false)
    existsItemsByMaterialTypeMock.mockResolvedValue(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── createMaterialType ─────────────────────────────────────────

  it("createMaterialType threads actor.id and revalidates material paths", async () => {
    const { createMaterialType } = await import("@/app/actions/materials")

    await createMaterialType({
      name: "Butyl",
      description: "Rubber sheet material",
      default_cost: 2.5,
      min_stock_alert: 100,
    })

    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageMaterialTypes")
    expect(createSvcMock).toHaveBeenCalledWith(
      {
        name: "Butyl",
        description: "Rubber sheet material",
        default_cost: 2.5,
        min_stock_alert: 100,
      },
      ACTOR.id
    )
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/settings/materials")
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory")
  })

  it("createMaterialType rejects empty name", async () => {
    const { createMaterialType } = await import("@/app/actions/materials")

    await expect(createMaterialType({ name: "" })).rejects.toThrow()
    expect(createSvcMock).not.toHaveBeenCalled()
  })

  it("createMaterialType rejects negative default_cost", async () => {
    const { createMaterialType } = await import("@/app/actions/materials")

    await expect(createMaterialType({ name: "Butyl", default_cost: -1 })).rejects.toThrow()
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
    expect(updates).toEqual({ name: "Renamed" })
    expect(updates).not.toHaveProperty("user_id")
    expect(updates).not.toHaveProperty("created_at")
    expect(updates).not.toHaveProperty("updated_at")
  })

  it("updateMaterialType rejects bad UUID before service call", async () => {
    const { updateMaterialType } = await import("@/app/actions/materials")

    await expect(updateMaterialType({ id: "not-a-uuid", name: "X" })).rejects.toThrow()
    expect(updateSvcMock).not.toHaveBeenCalled()
  })

  it("updateMaterialType allows partial updates (just default_cost)", async () => {
    const { updateMaterialType } = await import("@/app/actions/materials")

    await updateMaterialType({ id: MATERIAL_ID, default_cost: 3.75 })

    const updates = updateSvcMock.mock.calls[0][1]
    expect(updates).toEqual({ default_cost: 3.75 })
  })

  // ── deleteMaterialType ─────────────────────────────────────────

  it("deleteMaterialType happy path — guards pass, service called, revalidate", async () => {
    const { deleteMaterialType } = await import("@/app/actions/materials")

    const result = await deleteMaterialType({ id: MATERIAL_ID })

    expect(getByIdsSvcMock).toHaveBeenCalledWith([MATERIAL_ID])
    expect(existsByMaterialTypeMock).toHaveBeenCalledWith("Butyl")
    expect(existsItemsByMaterialTypeMock).toHaveBeenCalledWith(MATERIAL_ID)
    expect(deleteSvcMock).toHaveBeenCalledWith(MATERIAL_ID)
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
    expect(deleteSvcMock).not.toHaveBeenCalled()
  })

  it("deleteMaterialType returns in_use_by_rolls when rolls exist", async () => {
    existsByMaterialTypeMock.mockResolvedValue(true)
    const { deleteMaterialType } = await import("@/app/actions/materials")

    const result = await deleteMaterialType({ id: MATERIAL_ID })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("in_use_by_rolls")
    }
    // Short-circuits before the PO check or the delete itself
    expect(existsItemsByMaterialTypeMock).not.toHaveBeenCalled()
    expect(deleteSvcMock).not.toHaveBeenCalled()
  })

  it("deleteMaterialType returns in_use_by_purchase_orders when PO items exist", async () => {
    existsItemsByMaterialTypeMock.mockResolvedValue(true)
    const { deleteMaterialType } = await import("@/app/actions/materials")

    const result = await deleteMaterialType({ id: MATERIAL_ID })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("in_use_by_purchase_orders")
    }
    expect(deleteSvcMock).not.toHaveBeenCalled()
  })

  it("deleteMaterialType handles FK race (delete fails after pre-flight passed)", async () => {
    deleteSvcMock.mockRejectedValue({ code: "23503", message: "violates foreign key constraint" })
    const { deleteMaterialType } = await import("@/app/actions/materials")

    const result = await deleteMaterialType({ id: MATERIAL_ID })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("delete_failed")
      expect(result.message).toMatch(/referenced by other records/i)
    }
  })

  it("deleteMaterialType rejects callers without manageMaterialTypes", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })
    const { deleteMaterialType } = await import("@/app/actions/materials")

    await expect(deleteMaterialType({ id: MATERIAL_ID })).rejects.toThrow("forbidden")
    expect(getByIdsSvcMock).not.toHaveBeenCalled()
    expect(deleteSvcMock).not.toHaveBeenCalled()
  })
})
