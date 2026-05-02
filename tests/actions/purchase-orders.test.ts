/**
 * Smoke tests for the PO server-action wrappers (ARC-147).
 *
 * Pattern: mock the auth/permission helpers and the DI resolver, then
 * verify each action threads `actor` through and invalidates the right
 * path. Use-case logic itself is covered separately under
 * `tests/use-cases/`; this file only verifies the action-layer glue.
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

const PO_LIST_PATH = "/dashboard/inventory/purchase-orders"

describe("app/actions/purchase-orders", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requirePermissionMock.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("createPurchaseOrder calls auth + permission then executes the use-case with actor", async () => {
    const execute = vi.fn().mockResolvedValue({
      purchaseOrder: { id: "po-1" },
      taxCalculation: { taxAmount: 0 },
    })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { createPurchaseOrder } = await import("@/app/actions/purchase-orders")
    const result = await createPurchaseOrder({
      supplierId: "s-1",
      items: [],
    })

    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: "s-1", actor: ACTOR })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(PO_LIST_PATH)
    expect(result).toEqual({
      purchaseOrder: { id: "po-1" },
      taxCalculation: { taxAmount: 0 },
    })
  })

  it("createPurchaseOrder rejects when auth fails", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))

    const { createPurchaseOrder } = await import("@/app/actions/purchase-orders")
    await expect(createPurchaseOrder({ supplierId: "s-1", items: [] })).rejects.toThrow("unauth")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("createPurchaseOrder rejects when permission fails", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })

    const { createPurchaseOrder } = await import("@/app/actions/purchase-orders")
    await expect(createPurchaseOrder({ supplierId: "s-1", items: [] })).rejects.toThrow("forbidden")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("updatePurchaseOrder threads actor and revalidates the list path", async () => {
    const execute = vi.fn().mockResolvedValue({
      purchaseOrder: { id: "po-1" },
      taxCalculation: { taxAmount: 0 },
    })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { updatePurchaseOrder } = await import("@/app/actions/purchase-orders")
    await updatePurchaseOrder({
      purchaseOrderId: "po-1",
      supplierId: "s-1",
      items: [],
    })

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ actor: ACTOR }))
    expect(revalidatePathMock).toHaveBeenCalledWith(PO_LIST_PATH)
  })

  it("approvePurchaseOrder threads actor and revalidates", async () => {
    const execute = vi.fn().mockResolvedValue({ id: "po-1", status: "approved" })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { approvePurchaseOrder } = await import("@/app/actions/purchase-orders")
    await approvePurchaseOrder({ purchaseOrderId: "po-1" })

    expect(execute).toHaveBeenCalledWith({ purchaseOrderId: "po-1", actor: ACTOR })
    expect(revalidatePathMock).toHaveBeenCalledWith(PO_LIST_PATH)
  })

  it("rejectPurchaseOrder threads actor with reason", async () => {
    const execute = vi.fn().mockResolvedValue({ id: "po-1", status: "rejected" })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { rejectPurchaseOrder } = await import("@/app/actions/purchase-orders")
    await rejectPurchaseOrder({ purchaseOrderId: "po-1", reason: "wrong supplier" })

    expect(execute).toHaveBeenCalledWith({
      purchaseOrderId: "po-1",
      reason: "wrong supplier",
      actor: ACTOR,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith(PO_LIST_PATH)
  })

  it("receivePurchaseOrder threads actor with items", async () => {
    const execute = vi.fn().mockResolvedValue({ partialReceipt: false, rollsCreated: [] })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { receivePurchaseOrder } = await import("@/app/actions/purchase-orders")
    const items = [{ itemId: "i-1", quantityReceived: 5 }]
    await receivePurchaseOrder({ purchaseOrderId: "po-1", items })

    expect(execute).toHaveBeenCalledWith({
      purchaseOrderId: "po-1",
      items,
      actor: ACTOR,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith(PO_LIST_PATH)
  })
})
