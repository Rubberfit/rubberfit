import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"
import type { ReorderRuleWithDetails } from "@/src/infrastructure/models/supabase"

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
}

// Stable test UUIDs.
const MATERIAL_TYPE_ID = "00000000-0000-4000-8000-000000000010"
const SUPPLIER_ID = "00000000-0000-4000-8000-000000000011"
const RULE_ID = "00000000-0000-4000-8000-000000000012"
const PO_ID = "00000000-0000-4000-8000-000000000013"

// Realistic ReorderSuggestionOutput shape (now Zod-validated).
const VALID_SUGGESTION = {
  materialTypeId: MATERIAL_TYPE_ID,
  materialName: "Black butyl rubber",
  currentStock: 10,
  reorderPoint: 50,
  suggestedQuantity: 100,
  urgencyLevel: "high" as const,
  daysUntilStockout: 5,
  supplierId: SUPPLIER_ID,
  supplierName: "Acme Rubber",
  estimatedCost: 550,
}

// Cast through unknown — the action's public type is
// `ReorderRuleWithDetails[]` (full DB row + joins), but the use-case
// only reads a subset and Zod validates that subset. Filling out
// every column on a synthetic test object would be brittle without
// adding any test signal.
const VALID_RULE: ReorderRuleWithDetails = {
  id: RULE_ID,
  material_type_id: MATERIAL_TYPE_ID,
  reorder_point: 50,
  reorder_quantity: 100,
  current_stock: 10,
  supplier_id: SUPPLIER_ID,
  material_type: { name: "Black butyl rubber", default_cost: 5.5 },
  supplier: { name: "Acme Rubber" },
} as unknown as ReorderRuleWithDetails

describe("app/actions/reorder", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requirePermissionMock.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("createReorderPurchaseOrder threads actor and revalidates reorder + PO paths", async () => {
    const execute = vi.fn().mockResolvedValue({ purchaseOrder: { id: PO_ID } })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { createReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await createReorderPurchaseOrder({
      suggestion: VALID_SUGGESTION,
      reorderRules: [VALID_RULE],
    })

    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ actor: ACTOR }))
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/reorder")
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/purchase-orders")
  })

  it("createReorderPurchaseOrder Zod-rejects malformed suggestion", async () => {
    // TS accepts `string` for materialTypeId (Zod's UUID check is
    // runtime-only); the runtime tripwire is the protection.
    const { createReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await expect(
      createReorderPurchaseOrder({
        suggestion: { ...VALID_SUGGESTION, materialTypeId: "not-a-uuid" },
        reorderRules: [VALID_RULE],
      })
    ).rejects.toThrow()
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("createReorderPurchaseOrder strips top-level smuggled keys before forwarding to the use-case", async () => {
    // Defense-in-depth: even though `Omit<UseCaseInput, "actor">` types
    // out the public surface at compile time, the RPC wire format is
    // untyped JSON. A malicious client can attach arbitrary top-level
    // keys; the action layer must drop them before they reach the
    // use-case. (Per-rule extras still survive — `reorderRuleSchema`
    // uses .passthrough() because callers legitimately pass DB-row
    // shapes with joined columns Zod's subset doesn't enumerate.)
    const execute = vi.fn().mockResolvedValue({ purchaseOrder: { id: PO_ID } })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { createReorderPurchaseOrder } = await import("@/app/actions/reorder")
    const smuggled = {
      suggestion: VALID_SUGGESTION,
      reorderRules: [VALID_RULE],
      bulkOverride: true,
      forgedActorId: "00000000-0000-4000-8000-000000000666",
    } as unknown as { suggestion: typeof VALID_SUGGESTION; reorderRules: ReorderRuleWithDetails[] }
    await createReorderPurchaseOrder(smuggled)

    const calledWith = execute.mock.calls[0]?.[0] as Record<string, unknown>
    expect(calledWith.bulkOverride).toBeUndefined()
    expect(calledWith.forgedActorId).toBeUndefined()
    // Real actor still threaded from the session, not from input.
    expect(calledWith.actor).toEqual(ACTOR)
  })

  it("createBulkReorderPurchaseOrder strips top-level smuggled keys", async () => {
    const execute = vi.fn().mockResolvedValue({ purchaseOrders: [], skipped: [] })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    const smuggled = {
      suggestions: [VALID_SUGGESTION],
      reorderRules: [VALID_RULE],
      skipApprovalGate: true,
    } as unknown as {
      suggestions: (typeof VALID_SUGGESTION)[]
      reorderRules: ReorderRuleWithDetails[]
    }
    await createBulkReorderPurchaseOrder(smuggled)

    const calledWith = execute.mock.calls[0]?.[0] as Record<string, unknown>
    expect(calledWith.skipApprovalGate).toBeUndefined()
    expect(calledWith.actor).toEqual(ACTOR)
  })

  it("generateReorderSuggestions enforces auth + permission but does NOT pass actor (read-only)", async () => {
    const execute = vi.fn().mockResolvedValue([])
    resolveUseCaseMock.mockReturnValue({ execute })

    const { generateReorderSuggestions } = await import("@/app/actions/reorder")
    const result = await generateReorderSuggestions({ rules: [VALID_RULE], pendingPOs: [] })

    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ rules: expect.any(Array), pendingPOs: [] })
    )
    // Read-only — no actor field on the use-case input
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({ actor: expect.anything() }))
    // Read-only — no path revalidation
    expect(revalidatePathMock).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it("rejects unauthenticated callers before resolving the use-case", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))

    const { generateReorderSuggestions } = await import("@/app/actions/reorder")
    await expect(
      generateReorderSuggestions({ rules: [VALID_RULE], pendingPOs: [] })
    ).rejects.toThrow("unauth")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("createBulkReorderPurchaseOrder threads actor and revalidates when POs are created", async () => {
    const execute = vi.fn().mockResolvedValue({
      purchaseOrders: [{ id: PO_ID }],
      skipped: [],
    })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    const result = await createBulkReorderPurchaseOrder({
      suggestions: [VALID_SUGGESTION],
      reorderRules: [VALID_RULE],
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
      skipped: [
        {
          suggestion: VALID_SUGGESTION,
          reason: "no_supplier" as const,
          message: "no supplier",
        },
      ],
    })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await createBulkReorderPurchaseOrder({
      suggestions: [VALID_SUGGESTION],
      reorderRules: [VALID_RULE],
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
