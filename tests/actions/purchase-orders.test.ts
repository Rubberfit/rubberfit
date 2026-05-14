/**
 * Smoke tests for the PO server-action wrappers (ARC-147).
 *
 * Pattern: mock the auth/permission helpers and the DI resolver, then
 * verify each action threads `actor` through and invalidates the right
 * path. Use-case logic itself is covered separately under
 * `tests/use-cases/`; this file only verifies the action-layer glue.
 *
 * Round-3 (post-Sigilix Zod-validation feedback): inputs are now
 * Zod-parsed before forwarding to the use-case. Tests pass realistic
 * UUIDs and at least one item per PO so they exercise the full
 * auth → permission → parse → execute → revalidate path.
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
  id: "00000000-0000-4000-8000-000000000099",
  email: "alice@example.com",
  roles: ["manager"],
  isSuperAdmin: false,
  activeTenantId: null,
}

const PO_LIST_PATH = "/dashboard/inventory/purchase-orders"

// Stable test UUIDs. Format-valid (8-4-4-4-12 hex) so Zod's `.uuid()`
// passes — Zod doesn't check version bits, just shape.
const SUPPLIER_ID = "00000000-0000-4000-8000-000000000001"
const MATERIAL_TYPE_ID = "00000000-0000-4000-8000-000000000002"
const PO_ID = "00000000-0000-4000-8000-000000000003"
const PO_ITEM_ID = "00000000-0000-4000-8000-000000000004"
const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000005"

const VALID_ITEM = {
  materialTypeId: MATERIAL_TYPE_ID,
  description: "Black butyl rubber",
  quantitySqft: 100,
  unitCost: 5.5,
}

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
      purchaseOrder: { id: PO_ID },
      taxCalculation: { taxAmount: 0 },
    })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { createPurchaseOrder } = await import("@/app/actions/purchase-orders")
    const result = await createPurchaseOrder({
      supplierId: SUPPLIER_ID,
      items: [VALID_ITEM],
    })

    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: SUPPLIER_ID, actor: ACTOR })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(PO_LIST_PATH)
    expect(result).toEqual({
      purchaseOrder: { id: PO_ID },
      taxCalculation: { taxAmount: 0 },
    })
  })

  it("createPurchaseOrder rejects when auth fails", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))

    const { createPurchaseOrder } = await import("@/app/actions/purchase-orders")
    await expect(
      createPurchaseOrder({ supplierId: SUPPLIER_ID, items: [VALID_ITEM] })
    ).rejects.toThrow("unauth")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("createPurchaseOrder rejects when permission fails", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })

    const { createPurchaseOrder } = await import("@/app/actions/purchase-orders")
    await expect(
      createPurchaseOrder({ supplierId: SUPPLIER_ID, items: [VALID_ITEM] })
    ).rejects.toThrow("forbidden")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("createPurchaseOrder Zod-rejects bad input after auth runs (auth-then-parse order)", async () => {
    // Auth and permission both pass; Zod parsing fails afterward
    // because supplierId isn't a UUID. The action MUST reject the
    // call without resolving the use-case. (TS sees `string` so no
    // compile-time error — the runtime tripwire is the protection.)
    const { createPurchaseOrder } = await import("@/app/actions/purchase-orders")
    await expect(
      createPurchaseOrder({ supplierId: "not-a-uuid", items: [VALID_ITEM] })
    ).rejects.toThrow()
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("createPurchaseOrder Zod-rejects empty items list", async () => {
    const { createPurchaseOrder } = await import("@/app/actions/purchase-orders")
    await expect(createPurchaseOrder({ supplierId: SUPPLIER_ID, items: [] })).rejects.toThrow()
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("createPurchaseOrder strips unknown keys before forwarding to use-case", async () => {
    // Field-smuggling guard: extra keys on the public input must NOT
    // reach the use-case body. Zod's default object behavior strips
    // unknowns; we assert the executed input lacks the smuggled key.
    const execute = vi.fn().mockResolvedValue({
      purchaseOrder: { id: PO_ID },
      taxCalculation: { taxAmount: 0 },
    })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { createPurchaseOrder } = await import("@/app/actions/purchase-orders")
    // Extra keys are runtime-injected — TypeScript wouldn't catch them
    // on a JSON.parse-shaped object anyway, which is what the
    // server-action RPC boundary actually receives.
    const smuggled = {
      supplierId: SUPPLIER_ID,
      items: [VALID_ITEM],
      poNumber: "PO-999-FORGED",
      auto_generated: true,
    } as unknown as { supplierId: string; items: (typeof VALID_ITEM)[] }
    await createPurchaseOrder(smuggled)

    const calledWith = execute.mock.calls[0]?.[0] as Record<string, unknown>
    expect(calledWith.poNumber).toBeUndefined()
    expect(calledWith.auto_generated).toBeUndefined()
  })

  it("updatePurchaseOrder threads actor and revalidates the list path", async () => {
    const execute = vi.fn().mockResolvedValue({
      purchaseOrder: { id: PO_ID },
      taxCalculation: { taxAmount: 0 },
    })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { updatePurchaseOrder } = await import("@/app/actions/purchase-orders")
    await updatePurchaseOrder({
      purchaseOrderId: PO_ID,
      supplierId: SUPPLIER_ID,
      items: [VALID_ITEM],
    })

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ actor: ACTOR }))
    expect(revalidatePathMock).toHaveBeenCalledWith(PO_LIST_PATH)
  })

  it("approvePurchaseOrder threads actor and revalidates", async () => {
    const execute = vi.fn().mockResolvedValue({ id: PO_ID, status: "approved" })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { approvePurchaseOrder } = await import("@/app/actions/purchase-orders")
    await approvePurchaseOrder({ purchaseOrderId: PO_ID })

    expect(execute).toHaveBeenCalledWith({ purchaseOrderId: PO_ID, actor: ACTOR })
    expect(revalidatePathMock).toHaveBeenCalledWith(PO_LIST_PATH)
  })

  it("rejectPurchaseOrder threads actor with reason", async () => {
    const execute = vi.fn().mockResolvedValue({ id: PO_ID, status: "rejected" })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { rejectPurchaseOrder } = await import("@/app/actions/purchase-orders")
    await rejectPurchaseOrder({ purchaseOrderId: PO_ID, reason: "wrong supplier" })

    expect(execute).toHaveBeenCalledWith({
      purchaseOrderId: PO_ID,
      reason: "wrong supplier",
      actor: ACTOR,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith(PO_LIST_PATH)
  })

  it("receivePurchaseOrder threads actor with items and idempotencyKey", async () => {
    const execute = vi.fn().mockResolvedValue({ partialReceipt: false, rollsCreated: [] })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { receivePurchaseOrder } = await import("@/app/actions/purchase-orders")
    const items = [{ itemId: PO_ITEM_ID, quantityReceived: 5 }]
    await receivePurchaseOrder({
      purchaseOrderId: PO_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      items,
    })

    expect(execute).toHaveBeenCalledWith({
      purchaseOrderId: PO_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      items,
      actor: ACTOR,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith(PO_LIST_PATH)
  })

  // sigilix PR #177 follow-up: poReceiptItemSchema.quantityReceived
  // was z.number().min(0). Receiving 0 is semantically "don't include
  // the item" — mirror quantitySqft's .positive() contract.
  it("receivePurchaseOrder rejects quantityReceived: 0", async () => {
    const execute = vi.fn()
    resolveUseCaseMock.mockReturnValue({ execute })

    const { receivePurchaseOrder } = await import("@/app/actions/purchase-orders")
    await expect(
      receivePurchaseOrder({
        purchaseOrderId: PO_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        items: [{ itemId: PO_ITEM_ID, quantityReceived: 0 }],
      })
    ).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("receivePurchaseOrder rejects negative quantityReceived", async () => {
    const execute = vi.fn()
    resolveUseCaseMock.mockReturnValue({ execute })

    const { receivePurchaseOrder } = await import("@/app/actions/purchase-orders")
    await expect(
      receivePurchaseOrder({
        purchaseOrderId: PO_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        items: [{ itemId: PO_ITEM_ID, quantityReceived: -1 }],
      })
    ).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
    // Match the zero-quantity test — parse failure shouldn't trigger
    // cache invalidation (coderabbit follow-up on PR #197).
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  // Step 7c-1: idempotencyKey is required and must be a valid UUID.
  it("receivePurchaseOrder rejects missing idempotencyKey", async () => {
    const execute = vi.fn()
    resolveUseCaseMock.mockReturnValue({ execute })

    const { receivePurchaseOrder } = await import("@/app/actions/purchase-orders")
    await expect(
      receivePurchaseOrder({
        purchaseOrderId: PO_ID,
        // idempotencyKey omitted on purpose
        items: [{ itemId: PO_ITEM_ID, quantityReceived: 5 }],
      } as unknown as Parameters<typeof receivePurchaseOrder>[0])
    ).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("receivePurchaseOrder rejects malformed idempotencyKey", async () => {
    const execute = vi.fn()
    resolveUseCaseMock.mockReturnValue({ execute })

    const { receivePurchaseOrder } = await import("@/app/actions/purchase-orders")
    await expect(
      receivePurchaseOrder({
        purchaseOrderId: PO_ID,
        idempotencyKey: "not-a-uuid",
        items: [{ itemId: PO_ITEM_ID, quantityReceived: 5 }],
      })
    ).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
