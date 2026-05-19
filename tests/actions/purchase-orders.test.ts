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

const requireActiveSubscriptionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-active-subscription", () => ({
  requireActiveSubscription: requireActiveSubscriptionMock,
}))

const requirePermissionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-permission", () => ({
  requirePermission: requirePermissionMock,
}))

const resolveUseCaseMock = vi.hoisted(() => vi.fn())
const resolveServiceMock = vi.hoisted(() => vi.fn())
vi.mock("@/di/resolve", () => ({
  resolveUseCase: resolveUseCaseMock,
  resolveService: resolveServiceMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

// Mocked for the 3 read-only actions (getById, existsActiveItems, list).
// supplierService.getActiveSuppliers + getSupplierById feed the supplier-name
// join those actions stitch onto the legacy shape; purchaseOrderEntityToLegacyWithItems
// is passthrough'd so tests don't have to construct full entity instances.
const supplierServiceMock = vi.hoisted(() => ({
  getSupplierById: vi.fn(),
  getActiveSuppliers: vi.fn(),
}))
vi.mock("@/src/infrastructure/services/supplierService", () => ({
  supplierService: supplierServiceMock,
}))

const purchaseOrderEntityToLegacyWithItemsMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/po-entity-to-legacy", () => ({
  purchaseOrderEntityToLegacyWithItems: purchaseOrderEntityToLegacyWithItemsMock,
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
    requireActiveSubscriptionMock.mockResolvedValue({ kind: "allowed" })
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

  // ─── Read-only actions (subscription-gated post-DDD-merge) ──────────────

  const FAKE_PO_ENTITY = {
    id: { value: PO_ID },
    supplierId: { value: SUPPLIER_ID },
  } as unknown as Parameters<typeof purchaseOrderEntityToLegacyWithItemsMock>[0]
  const FAKE_SUPPLIER_ENTITY = {
    id: { value: SUPPLIER_ID },
    name: "Acme Rubber Co.",
  }
  const LEGACY_SHAPE = { id: PO_ID, supplier_id: SUPPLIER_ID, items: [] }

  // ─ getPurchaseOrderByIdAction ─

  it("getPurchaseOrderByIdAction returns legacy shape from entity + supplier join", async () => {
    const svc = { getById: vi.fn().mockResolvedValue(FAKE_PO_ENTITY) }
    resolveServiceMock.mockReturnValue(svc)
    supplierServiceMock.getSupplierById.mockResolvedValue(FAKE_SUPPLIER_ENTITY)
    purchaseOrderEntityToLegacyWithItemsMock.mockReturnValue(LEGACY_SHAPE)

    const { getPurchaseOrderByIdAction } = await import("@/app/actions/purchase-orders")
    const result = await getPurchaseOrderByIdAction(PO_ID)

    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    expect(requireActiveSubscriptionMock).toHaveBeenCalledWith(ACTOR)
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(svc.getById).toHaveBeenCalledWith(PO_ID)
    expect(result).toBe(LEGACY_SHAPE)
  })

  it("getPurchaseOrderByIdAction rejects when auth fails", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { getPurchaseOrderByIdAction } = await import("@/app/actions/purchase-orders")
    await expect(getPurchaseOrderByIdAction(PO_ID)).rejects.toThrow("unauth")
    expect(resolveServiceMock).not.toHaveBeenCalled()
  })

  it("getPurchaseOrderByIdAction rejects when subscription is lapsed", async () => {
    requireActiveSubscriptionMock.mockRejectedValue(new Error("NO_ACTIVE_SUBSCRIPTION"))
    const { getPurchaseOrderByIdAction } = await import("@/app/actions/purchase-orders")
    await expect(getPurchaseOrderByIdAction(PO_ID)).rejects.toThrow("NO_ACTIVE_SUBSCRIPTION")
    expect(requirePermissionMock).not.toHaveBeenCalled()
    expect(resolveServiceMock).not.toHaveBeenCalled()
  })

  it("getPurchaseOrderByIdAction rejects when permission fails", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })
    const { getPurchaseOrderByIdAction } = await import("@/app/actions/purchase-orders")
    await expect(getPurchaseOrderByIdAction(PO_ID)).rejects.toThrow("forbidden")
    expect(resolveServiceMock).not.toHaveBeenCalled()
  })

  // ─ existsActiveItemsByMaterialTypeAction ─

  it("existsActiveItemsByMaterialTypeAction returns boolean from service", async () => {
    const svc = { existsActiveItemsByMaterialType: vi.fn().mockResolvedValue(true) }
    resolveServiceMock.mockReturnValue(svc)

    const { existsActiveItemsByMaterialTypeAction } = await import("@/app/actions/purchase-orders")
    const result = await existsActiveItemsByMaterialTypeAction(MATERIAL_TYPE_ID)

    // Permission token differs from the rest of the PO surface:
    // material-type delete dialog gates on manageMaterialTypes.
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageMaterialTypes")
    expect(svc.existsActiveItemsByMaterialType).toHaveBeenCalledWith(MATERIAL_TYPE_ID)
    expect(result).toBe(true)
  })

  it("existsActiveItemsByMaterialTypeAction rejects when auth fails", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { existsActiveItemsByMaterialTypeAction } = await import("@/app/actions/purchase-orders")
    await expect(existsActiveItemsByMaterialTypeAction(MATERIAL_TYPE_ID)).rejects.toThrow("unauth")
    expect(resolveServiceMock).not.toHaveBeenCalled()
  })

  it("existsActiveItemsByMaterialTypeAction rejects when subscription is lapsed", async () => {
    requireActiveSubscriptionMock.mockRejectedValue(new Error("NO_ACTIVE_SUBSCRIPTION"))
    const { existsActiveItemsByMaterialTypeAction } = await import("@/app/actions/purchase-orders")
    await expect(existsActiveItemsByMaterialTypeAction(MATERIAL_TYPE_ID)).rejects.toThrow(
      "NO_ACTIVE_SUBSCRIPTION"
    )
    expect(resolveServiceMock).not.toHaveBeenCalled()
  })

  it("existsActiveItemsByMaterialTypeAction rejects when permission fails", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })
    const { existsActiveItemsByMaterialTypeAction } = await import("@/app/actions/purchase-orders")
    await expect(existsActiveItemsByMaterialTypeAction(MATERIAL_TYPE_ID)).rejects.toThrow(
      "forbidden"
    )
    expect(resolveServiceMock).not.toHaveBeenCalled()
  })

  // ─ listPurchaseOrdersAction ─

  it("listPurchaseOrdersAction joins supplier names onto returned POs", async () => {
    const svc = { getActive: vi.fn().mockResolvedValue([FAKE_PO_ENTITY]) }
    resolveServiceMock.mockReturnValue(svc)
    supplierServiceMock.getActiveSuppliers.mockResolvedValue([FAKE_SUPPLIER_ENTITY])
    purchaseOrderEntityToLegacyWithItemsMock.mockReturnValue(LEGACY_SHAPE)

    const { listPurchaseOrdersAction } = await import("@/app/actions/purchase-orders")
    const result = await listPurchaseOrdersAction()

    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(svc.getActive).toHaveBeenCalledOnce()
    expect(supplierServiceMock.getActiveSuppliers).toHaveBeenCalledOnce()
    expect(result).toEqual([LEGACY_SHAPE])
  })

  it("listPurchaseOrdersAction rejects when auth fails", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { listPurchaseOrdersAction } = await import("@/app/actions/purchase-orders")
    await expect(listPurchaseOrdersAction()).rejects.toThrow("unauth")
    expect(resolveServiceMock).not.toHaveBeenCalled()
  })

  it("listPurchaseOrdersAction rejects when subscription is lapsed", async () => {
    requireActiveSubscriptionMock.mockRejectedValue(new Error("NO_ACTIVE_SUBSCRIPTION"))
    const { listPurchaseOrdersAction } = await import("@/app/actions/purchase-orders")
    await expect(listPurchaseOrdersAction()).rejects.toThrow("NO_ACTIVE_SUBSCRIPTION")
    expect(resolveServiceMock).not.toHaveBeenCalled()
  })

  it("listPurchaseOrdersAction rejects when permission fails", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })
    const { listPurchaseOrdersAction } = await import("@/app/actions/purchase-orders")
    await expect(listPurchaseOrdersAction()).rejects.toThrow("forbidden")
    expect(resolveServiceMock).not.toHaveBeenCalled()
  })
})
