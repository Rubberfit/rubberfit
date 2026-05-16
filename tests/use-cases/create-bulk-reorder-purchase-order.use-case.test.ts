/**
 * Bulk reorder PO use-case tests — post DDD migration.
 *
 * The use-case now delegates atomic PO+item creation to
 * `ICreatePurchaseOrderUseCase`. The legacy two-call pattern
 * (createPO + N addItem + per-item rollback + recalculate) is gone —
 * an atomic insert via the delegated use-case eliminates the orphan
 * PO + per-item failure modes. The bulk use-case retains:
 *   - grouping by supplier
 *   - partial-failure semantics (skipped[] with reason codes)
 *   - per-item notification + rule trigger
 *   - sanitized error messages on the skipped[].message field
 */
import "reflect-metadata"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import { CreateBulkReorderPurchaseOrderUseCase } from "@/src/application/use-cases/reorder/create-bulk-reorder-purchase-order.use-case"
import type {
  CreateBulkReorderPurchaseOrderInput,
  ICreateBulkReorderPurchaseOrderUseCase,
} from "@/src/application/use-cases/reorder/create-bulk-reorder-purchase-order.use-case"
import type { ReorderSuggestionOutput } from "@/src/application/use-cases/reorder/generate-reorder-suggestions.use-case"
import type { ICreatePurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/create-purchase-order.use-case"
import type { IReorderService } from "@/src/application/services/reorder.service.interface"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import type {
  PurchaseOrderWithDetails,
  ReorderRuleWithDetails,
} from "@/src/infrastructure/models/supabase"

const ACTOR: ActionActor = {
  id: "user-1",
  email: "alice@example.com",
  roles: ["manager"],
  isSuperAdmin: false,
  activeTenantId: "tenant-1",
}

function makeSuggestion(overrides: Partial<ReorderSuggestionOutput> = {}): ReorderSuggestionOutput {
  return {
    materialTypeId: "mat-A",
    materialName: "Material A",
    currentStock: 10,
    reorderPoint: 50,
    suggestedQuantity: 100,
    urgencyLevel: "medium",
    daysUntilStockout: 5,
    supplierId: "sup-1",
    supplierName: "Supplier One",
    estimatedCost: 500,
    ...overrides,
  }
}

function makePO(overrides: Partial<PurchaseOrderWithDetails> = {}): PurchaseOrderWithDetails {
  return {
    id: "po-1",
    po_number: "PO-0001",
    supplier_id: "sup-1",
    status: "draft",
    ...overrides,
  } as PurchaseOrderWithDetails
}

interface FakeCreatePoUseCase {
  execute: ReturnType<typeof vi.fn>
}

function makeFakeCreatePoUseCase(): FakeCreatePoUseCase {
  return {
    execute: vi.fn().mockResolvedValue({ purchaseOrder: makePO(), taxCalculation: {} }),
  }
}

function makeFakeReorderService(): IReorderService {
  return {
    recordTrigger: vi.fn().mockResolvedValue({}),
  } as unknown as IReorderService
}

function makeFakeNotificationService(): INotificationService {
  return {
    sendReorderTriggered: vi.fn().mockResolvedValue(undefined),
  } as unknown as INotificationService
}

interface Fakes {
  createPoUseCase: FakeCreatePoUseCase
  reorderService: IReorderService
  notificationService: INotificationService
}

function registerFakes(): Fakes {
  const createPoUseCase = makeFakeCreatePoUseCase()
  const reorderService = makeFakeReorderService()
  const notificationService = makeFakeNotificationService()

  container.registerInstance(TOKENS.ICreatePurchaseOrderUseCase, createPoUseCase)
  container.registerInstance(TOKENS.IReorderService, reorderService)
  container.registerInstance(TOKENS.INotificationService, notificationService)

  return { createPoUseCase, reorderService, notificationService }
}

function resolve(): ICreateBulkReorderPurchaseOrderUseCase {
  return container.resolve(CreateBulkReorderPurchaseOrderUseCase)
}

function buildInput(
  suggestions: ReorderSuggestionOutput[],
  rules: ReorderRuleWithDetails[] = []
): CreateBulkReorderPurchaseOrderInput {
  return { suggestions, reorderRules: rules, actor: ACTOR }
}

describe("CreateBulkReorderPurchaseOrderUseCase (post-DDD)", () => {
  let fakes: Fakes

  beforeEach(() => {
    container.reset()
    fakes = registerFakes()
  })

  afterEach(() => {
    container.reset()
  })

  it("groups suggestions by supplier and emits one PO per supplier", async () => {
    const a1 = makeSuggestion({ supplierId: "sup-1", materialTypeId: "mat-A1" })
    const a2 = makeSuggestion({ supplierId: "sup-1", materialTypeId: "mat-A2" })
    const b1 = makeSuggestion({ supplierId: "sup-2", materialTypeId: "mat-B1" })

    fakes.createPoUseCase.execute
      .mockResolvedValueOnce({ purchaseOrder: makePO({ id: "po-A", supplier_id: "sup-1" }) })
      .mockResolvedValueOnce({ purchaseOrder: makePO({ id: "po-B", supplier_id: "sup-2" }) })

    const result = await resolve().execute(buildInput([a1, a2, b1]))

    expect(result.purchaseOrders).toHaveLength(2)
    expect(fakes.createPoUseCase.execute).toHaveBeenCalledTimes(2)
    expect(result.skipped).toEqual([])
  })

  it("skips suggestions without a supplier (no_supplier)", async () => {
    const noSup = makeSuggestion({ supplierId: undefined, materialTypeId: "mat-X" })
    const result = await resolve().execute(buildInput([noSup]))
    expect(result.purchaseOrders).toEqual([])
    expect(result.skipped).toEqual([
      expect.objectContaining({ reason: "no_supplier", suggestion: noSup }),
    ])
    expect(fakes.createPoUseCase.execute).not.toHaveBeenCalled()
  })

  it("when the delegated create use-case throws for a supplier, every item in that group goes to skipped (po_creation_failed)", async () => {
    const item1 = makeSuggestion({ materialTypeId: "mat-A1" })
    const item2 = makeSuggestion({ materialTypeId: "mat-A2" })
    fakes.createPoUseCase.execute.mockRejectedValueOnce(new Error("FK violation"))

    const result = await resolve().execute(buildInput([item1, item2]))

    expect(result.purchaseOrders).toEqual([])
    expect(result.skipped).toHaveLength(2)
    expect(result.skipped.every((s) => s.reason === "po_creation_failed")).toBe(true)
    // Sanitized — no raw error text.
    expect(result.skipped[0].message).not.toContain("FK violation")
  })

  it("classifies tax-related errors as tax_calculation_failed", async () => {
    const item = makeSuggestion()
    fakes.createPoUseCase.execute.mockRejectedValueOnce(new Error("Tax service timeout"))

    const result = await resolve().execute(buildInput([item]))

    expect(result.skipped[0].reason).toBe("tax_calculation_failed")
  })

  it("on success, fires recordTrigger + sendReorderTriggered per item; failures are non-fatal", async () => {
    const item = makeSuggestion()
    const rule = {
      id: "rule-1",
      material_type_id: "mat-A",
    } as ReorderRuleWithDetails

    ;(fakes.reorderService.recordTrigger as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("rule update failed")
    )
    ;(
      fakes.notificationService.sendReorderTriggered as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("notification failed"))

    const result = await resolve().execute(buildInput([item], [rule]))

    expect(result.purchaseOrders).toHaveLength(1)
    expect(fakes.reorderService.recordTrigger).toHaveBeenCalledWith("rule-1")
    expect(fakes.notificationService.sendReorderTriggered).toHaveBeenCalled()
  })

  it("threads actor through to the delegated create use-case", async () => {
    await resolve().execute(buildInput([makeSuggestion()]))
    expect(fakes.createPoUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actor: ACTOR })
    )
  })
})
