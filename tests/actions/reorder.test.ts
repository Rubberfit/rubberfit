/**
 * Reorder action tests — post-Tier-2 authority-gap fix.
 *
 * The actions no longer accept client-supplied `suggestion[]` /
 * `reorderRules` payloads. Server fetches rules + stock + pending
 * POs, runs the generate-suggestions use-case, and forwards the
 * authoritative result to the create use-case. Tests mock:
 *
 *   - `requireAuthenticatedUser` + `requirePermission` (auth gate)
 *   - `resolveUseCase` (returns a fake with `execute` mocked)
 *   - `reorderService.getActiveReorderRules` + `calculateCurrentStock`
 *   - `purchaseOrderService.getPurchaseOrdersByStatuses`
 *   - `revalidatePath`
 *
 * Two `resolveUseCase` resolvers are needed per write-action invocation
 * because the action calls the generate-suggestions use-case before
 * the create use-case. The mock returns objects keyed by token.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"
import type { ReorderRuleWithDetails } from "@/src/infrastructure/models/supabase"
import type { ReorderSuggestionOutput } from "@/src/application/use-cases/reorder/generate-reorder-suggestions.use-case"
import { TOKENS } from "@/di/tokens"

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

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const reorderServiceMock = vi.hoisted(() => ({
  getActiveReorderRules: vi.fn(),
  calculateCurrentStock: vi.fn(),
}))
vi.mock("@/src/infrastructure/services/legacyReorderService", () => ({
  legacyReorderService: reorderServiceMock,
}))

const purchaseOrderServiceMock = vi.hoisted(() => ({
  getPurchaseOrdersByStatuses: vi.fn(),
}))
vi.mock("@/src/infrastructure/services/purchaseOrderService", () => ({
  purchaseOrderService: purchaseOrderServiceMock,
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
const MATERIAL_TYPE_ID_B = "00000000-0000-4000-8000-000000000020"
const SUPPLIER_ID = "00000000-0000-4000-8000-000000000011"
const RULE_ID = "00000000-0000-4000-8000-000000000012"
const PO_ID = "00000000-0000-4000-8000-000000000013"

const ACTIVE_RULE: ReorderRuleWithDetails = {
  id: RULE_ID,
  material_type_id: MATERIAL_TYPE_ID,
  reorder_point: 50,
  reorder_quantity: 100,
  current_stock: 10,
  supplier_id: SUPPLIER_ID,
  active: true,
  material_type: { name: "Black butyl rubber", default_cost: 5.5 },
  supplier: { name: "Acme Rubber" },
} as unknown as ReorderRuleWithDetails

// Authoritative suggestion the generate use-case "produces" — what
// the create use-case ends up consuming. Its `estimatedCost` /
// `suggestedQuantity` are server-computed from the rule + stock
// (not anything a client sent).
const AUTHORITATIVE_SUGGESTION: ReorderSuggestionOutput = {
  materialTypeId: MATERIAL_TYPE_ID,
  materialName: "Black butyl rubber",
  currentStock: 10,
  reorderPoint: 50,
  suggestedQuantity: 100,
  urgencyLevel: "high",
  daysUntilStockout: 5,
  supplierId: SUPPLIER_ID,
  supplierName: "Acme Rubber",
  estimatedCost: 550,
}

// `resolveUseCase` is called multiple times per action: once for
// generate, once for the create. Route by token so the test can
// observe what each use-case received without juggling call order.
function setupUseCaseResolver(opts: {
  generateExecute?: ReturnType<typeof vi.fn>
  createSingleExecute?: ReturnType<typeof vi.fn>
  createBulkExecute?: ReturnType<typeof vi.fn>
}) {
  resolveUseCaseMock.mockImplementation((token: symbol) => {
    if (token === TOKENS.IGenerateReorderSuggestionsUseCase && opts.generateExecute) {
      return { execute: opts.generateExecute }
    }
    if (token === TOKENS.ICreateReorderPurchaseOrderUseCase && opts.createSingleExecute) {
      return { execute: opts.createSingleExecute }
    }
    if (token === TOKENS.ICreateBulkReorderPurchaseOrderUseCase && opts.createBulkExecute) {
      return { execute: opts.createBulkExecute }
    }
    throw new Error(`Unexpected resolveUseCase token: ${String(token)}`)
  })
}

describe("app/actions/reorder", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requirePermissionMock.mockReturnValue(undefined)
    reorderServiceMock.getActiveReorderRules.mockResolvedValue([ACTIVE_RULE])
    reorderServiceMock.calculateCurrentStock.mockResolvedValue(10)
    purchaseOrderServiceMock.getPurchaseOrdersByStatuses.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── createReorderPurchaseOrder ────────────────────────────────────

  it("createReorderPurchaseOrder regenerates suggestions server-side from materialTypeId", async () => {
    const generateExecute = vi.fn().mockResolvedValue([AUTHORITATIVE_SUGGESTION])
    const createSingleExecute = vi.fn().mockResolvedValue({ purchaseOrder: { id: PO_ID } })
    setupUseCaseResolver({ generateExecute, createSingleExecute })

    const { createReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await createReorderPurchaseOrder({ materialTypeId: MATERIAL_TYPE_ID })

    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(reorderServiceMock.getActiveReorderRules).toHaveBeenCalled()
    expect(generateExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: expect.arrayContaining([
          expect.objectContaining({ material_type_id: MATERIAL_TYPE_ID, current_stock: 10 }),
        ]),
        pendingPOs: [],
      })
    )

    // Authoritative suggestion is what the create use-case sees — the
    // client never authored it.
    expect(createSingleExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestion: AUTHORITATIVE_SUGGESTION,
        actor: ACTOR,
      })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/reorder")
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/purchase-orders")
  })

  it("createReorderPurchaseOrder ignores client-attempted smuggling — input shape is just { materialTypeId }", async () => {
    const generateExecute = vi.fn().mockResolvedValue([AUTHORITATIVE_SUGGESTION])
    const createSingleExecute = vi.fn().mockResolvedValue({ purchaseOrder: { id: PO_ID } })
    setupUseCaseResolver({ generateExecute, createSingleExecute })

    // A malicious client smuggles authored suggestion / forged actor.
    // Zod strips them — the action only sees materialTypeId.
    const smuggled = {
      materialTypeId: MATERIAL_TYPE_ID,
      suggestion: { ...AUTHORITATIVE_SUGGESTION, estimatedCost: 999_999 },
      reorderRules: [{ ...ACTIVE_RULE, reorder_quantity: 999 }],
      forgedActorId: "00000000-0000-4000-8000-000000000666",
    } as unknown as { materialTypeId: string }

    const { createReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await createReorderPurchaseOrder(smuggled)

    // The create use-case got the authoritative server-computed
    // suggestion, NOT the smuggled $999,999 one.
    expect(createSingleExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestion: AUTHORITATIVE_SUGGESTION,
        actor: ACTOR,
      })
    )
    const calledWith = createSingleExecute.mock.calls[0][0] as Record<string, unknown>
    expect(calledWith.forgedActorId).toBeUndefined()
  })

  it("createReorderPurchaseOrder Zod-rejects malformed materialTypeId", async () => {
    const { createReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await expect(createReorderPurchaseOrder({ materialTypeId: "not-a-uuid" })).rejects.toThrow()
    expect(reorderServiceMock.getActiveReorderRules).not.toHaveBeenCalled()
  })

  it("createReorderPurchaseOrder throws when generator produces no suggestion (above reorder point or no rule)", async () => {
    // Generator returns empty — material is above reorder point, has
    // no active rule, or has no resolvable supplier.
    const generateExecute = vi.fn().mockResolvedValue([])
    setupUseCaseResolver({ generateExecute })

    const { createReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await expect(createReorderPurchaseOrder({ materialTypeId: MATERIAL_TYPE_ID })).rejects.toThrow(
      /No reorder needed|no supplier/i
    )
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  // ── createBulkReorderPurchaseOrder ────────────────────────────────

  it("createBulkReorderPurchaseOrder regenerates suggestions server-side from materialTypeIds", async () => {
    const generateExecute = vi.fn().mockResolvedValue([AUTHORITATIVE_SUGGESTION])
    const createBulkExecute = vi
      .fn()
      .mockResolvedValue({ purchaseOrders: [{ id: PO_ID }], skipped: [] })
    setupUseCaseResolver({ generateExecute, createBulkExecute })

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    const result = await createBulkReorderPurchaseOrder({
      materialTypeIds: [MATERIAL_TYPE_ID],
    })

    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(reorderServiceMock.getActiveReorderRules).toHaveBeenCalled()
    expect(createBulkExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestions: [AUTHORITATIVE_SUGGESTION],
        actor: ACTOR,
      })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/reorder")
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/purchase-orders")
    expect(result.purchaseOrders).toHaveLength(1)
  })

  it("createBulkReorderPurchaseOrder filters out unrequested materials even if generator returns extras", async () => {
    const otherSuggestion: ReorderSuggestionOutput = {
      ...AUTHORITATIVE_SUGGESTION,
      materialTypeId: MATERIAL_TYPE_ID_B,
      materialName: "Different material",
    }
    const generateExecute = vi.fn().mockResolvedValue([AUTHORITATIVE_SUGGESTION, otherSuggestion])
    const createBulkExecute = vi
      .fn()
      .mockResolvedValue({ purchaseOrders: [{ id: PO_ID }], skipped: [] })
    setupUseCaseResolver({ generateExecute, createBulkExecute })

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await createBulkReorderPurchaseOrder({ materialTypeIds: [MATERIAL_TYPE_ID] })

    // Only the requested suggestion reaches the create use-case.
    const passedSuggestions = (createBulkExecute.mock.calls[0][0] as { suggestions: unknown[] })
      .suggestions
    expect(passedSuggestions).toHaveLength(1)
    expect((passedSuggestions[0] as ReorderSuggestionOutput).materialTypeId).toBe(MATERIAL_TYPE_ID)
  })

  it("createBulkReorderPurchaseOrder skips revalidation when no POs are created", async () => {
    const generateExecute = vi.fn().mockResolvedValue([AUTHORITATIVE_SUGGESTION])
    const createBulkExecute = vi.fn().mockResolvedValue({
      purchaseOrders: [],
      skipped: [
        {
          suggestion: AUTHORITATIVE_SUGGESTION,
          reason: "no_supplier" as const,
          message: "No supplier configured for this material",
        },
      ],
    })
    setupUseCaseResolver({ generateExecute, createBulkExecute })

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await createBulkReorderPurchaseOrder({ materialTypeIds: [MATERIAL_TYPE_ID] })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("createBulkReorderPurchaseOrder returns empty result when generator produces no suggestions", async () => {
    // No active rules match the requested IDs — short-circuit before
    // the create use-case is even resolved.
    reorderServiceMock.getActiveReorderRules.mockResolvedValue([])

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    const result = await createBulkReorderPurchaseOrder({
      materialTypeIds: [MATERIAL_TYPE_ID],
    })
    expect(result).toEqual({ purchaseOrders: [], skipped: [] })
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("createBulkReorderPurchaseOrder Zod-rejects empty materialTypeIds", async () => {
    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await expect(createBulkReorderPurchaseOrder({ materialTypeIds: [] })).rejects.toThrow()
    expect(reorderServiceMock.getActiveReorderRules).not.toHaveBeenCalled()
  })

  it("createBulkReorderPurchaseOrder rejects unauthenticated callers", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await expect(
      createBulkReorderPurchaseOrder({ materialTypeIds: [MATERIAL_TYPE_ID] })
    ).rejects.toThrow("unauth")
    expect(reorderServiceMock.getActiveReorderRules).not.toHaveBeenCalled()
  })

  // ── generateReorderSuggestions ────────────────────────────────────

  it("generateReorderSuggestions enforces auth + permission and fetches server-side data", async () => {
    const generateExecute = vi.fn().mockResolvedValue([AUTHORITATIVE_SUGGESTION])
    setupUseCaseResolver({ generateExecute })

    const { generateReorderSuggestions } = await import("@/app/actions/reorder")
    const result = await generateReorderSuggestions()

    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(reorderServiceMock.getActiveReorderRules).toHaveBeenCalled()
    expect(generateExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: expect.arrayContaining([
          expect.objectContaining({ material_type_id: MATERIAL_TYPE_ID }),
        ]),
        pendingPOs: [],
      })
    )
    // Read-only — no actor field passed to the use-case
    expect(generateExecute).not.toHaveBeenCalledWith(expect.objectContaining({ actor: ACTOR }))
    expect(revalidatePathMock).not.toHaveBeenCalled()
    expect(result).toEqual([AUTHORITATIVE_SUGGESTION])
  })

  it("generateReorderSuggestions returns empty array when no active rules exist", async () => {
    reorderServiceMock.getActiveReorderRules.mockResolvedValue([])

    const { generateReorderSuggestions } = await import("@/app/actions/reorder")
    const result = await generateReorderSuggestions()

    expect(result).toEqual([])
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("generateReorderSuggestions rejects unauthenticated callers", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { generateReorderSuggestions } = await import("@/app/actions/reorder")
    await expect(generateReorderSuggestions()).rejects.toThrow("unauth")
    expect(reorderServiceMock.getActiveReorderRules).not.toHaveBeenCalled()
  })
})
