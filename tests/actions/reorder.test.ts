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

const resolveUseCaseMock = vi.hoisted(() => vi.fn())
vi.mock("@/di/resolve", () => ({
  resolveUseCase: resolveUseCaseMock,
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

const ACTOR: ActionActor = {
  id: "user-1",
  email: "alice@example.com",
  roles: ["manager"],
  isSuperAdmin: false,
}

describe("app/actions/reorder", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requirePermissionMock.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("createReorderPurchaseOrder threads actor and revalidates reorder + PO paths", async () => {
    const execute = vi.fn().mockResolvedValue({ purchaseOrder: { id: "po-1" } })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { createReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await createReorderPurchaseOrder({
      suggestion: { materialTypeId: "m-1" } as never,
      reorderRules: [],
    })

    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ actor: ACTOR }))
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/reorder")
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/purchase-orders")
  })

  it("generateReorderSuggestions enforces auth + permission but does NOT pass actor (read-only)", async () => {
    const execute = vi.fn().mockResolvedValue([])
    resolveUseCaseMock.mockReturnValue({ execute })

    const { generateReorderSuggestions } = await import("@/app/actions/reorder")
    const result = await generateReorderSuggestions({ rules: [], pendingPOs: [] })

    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(execute).toHaveBeenCalledWith({ rules: [], pendingPOs: [] })
    // Read-only — no actor field on the use-case input
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({ actor: expect.anything() }))
    // Read-only — no path revalidation
    expect(revalidatePathMock).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it("rejects unauthenticated callers before resolving the use-case", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))

    const { generateReorderSuggestions } = await import("@/app/actions/reorder")
    await expect(generateReorderSuggestions({ rules: [], pendingPOs: [] })).rejects.toThrow(
      "unauth"
    )
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("createBulkReorderPurchaseOrder threads actor and revalidates when POs are created", async () => {
    const execute = vi.fn().mockResolvedValue({
      purchaseOrders: [{ id: "po-1" }],
      skipped: [],
    })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    const result = await createBulkReorderPurchaseOrder({
      suggestions: [{ materialTypeId: "m-1" } as never],
      reorderRules: [],
    })

    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ actor: ACTOR }))
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/reorder")
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/purchase-orders")
    expect(result.purchaseOrders).toHaveLength(1)
  })

  it("createBulkReorderPurchaseOrder skips revalidation when no POs are created", async () => {
    // All-skipped result (e.g. every suggestion missing a supplier).
    // Revalidating the route in this case would invalidate the cache
    // unnecessarily, including the suggestion list the user is still
    // looking at.
    const execute = vi.fn().mockResolvedValue({
      purchaseOrders: [],
      skipped: [{ suggestion: {}, reason: "no_supplier", message: "no supplier" }],
    })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await createBulkReorderPurchaseOrder({
      suggestions: [{ materialTypeId: "m-1" } as never],
      reorderRules: [],
    })

    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("createBulkReorderPurchaseOrder rejects unauthenticated callers", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await expect(
      createBulkReorderPurchaseOrder({ suggestions: [], reorderRules: [] })
    ).rejects.toThrow("unauth")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })
})
