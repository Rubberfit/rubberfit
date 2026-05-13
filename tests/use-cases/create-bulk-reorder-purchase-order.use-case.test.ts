/**
 * Bulk reorder PO use-case tests. Mirrors the DI-fakes pattern from
 * record-cut.use-case.test.ts: register fake services on the container,
 * resolve the use-case, exercise behavior. No Supabase, no vi.mock of
 * module-level service singletons.
 *
 * Coverage focus (the things this migration is supposed to fix or
 * preserve):
 *   - Real tax calculation used (not the hardcoded 0.08 from the
 *     legacy browser path)
 *   - Partial-failure semantics (skipped[] includes correct reason
 *     codes for each failure mode)
 *   - actor.id threaded into PO writes and rule updates
 *   - Notification + rule-update failures are non-fatal
 *   - Sanitized error messages (no raw Supabase error text leaks to
 *     the skipped[].message field)
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
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { IReorderService } from "@/src/application/services/reorder.service.interface"
import type { ISupplierService } from "@/src/application/services/supplier.service.interface"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { ITaxService } from "@/src/application/services/tax.service.interface"
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

// Tests cast through `unknown` — vi.fn() doesn't preserve the typed
// signatures on IPurchaseOrderService, but that's fine here because
// the use-case only consumes the two methods we mock, and the
// container is wired by Symbol token (no structural type check).
interface FakePOService {
  createPurchaseOrder: ReturnType<typeof vi.fn>
  addItemToPurchaseOrder: ReturnType<typeof vi.fn>
  recalculatePOTotals: ReturnType<typeof vi.fn>
  deletePurchaseOrder: ReturnType<typeof vi.fn>
}

function makeFakePOService(): FakePOService {
  return {
    createPurchaseOrder: vi.fn().mockResolvedValue(makePO()),
    addItemToPurchaseOrder: vi.fn().mockResolvedValue({}),
    recalculatePOTotals: vi.fn().mockResolvedValue(undefined),
    deletePurchaseOrder: vi.fn().mockResolvedValue(true),
  }
}

function makeFakeReorderService(): IReorderService {
  return {
    recordTrigger: vi.fn().mockResolvedValue({}),
  } as unknown as IReorderService
}

function makeFakeSupplierService(): ISupplierService {
  return {
    getSupplierById: vi.fn().mockResolvedValue({
      id: "sup-1",
      name: "Supplier One",
      address: "123 Main St",
      city: "Townsville",
      state: "TX",
      zip_code: "12345",
      country: "US",
      payment_terms: "Net 30",
    }),
  } as unknown as ISupplierService
}

function makeFakeNotificationService(): INotificationService {
  return {
    sendReorderTriggered: vi.fn().mockResolvedValue(undefined),
  } as unknown as INotificationService
}

function makeFakeTaxService(taxRate = 0.0625): ITaxService {
  return {
    calculatePurchaseOrderTax: vi
      .fn()
      .mockImplementation(async (_supplierId, subtotal: number) => ({
        subtotal,
        taxRate,
        taxAmount: subtotal * taxRate,
        taxName: "Mocked Rate",
        taxLevel: "state",
        total: subtotal * (1 + taxRate),
      })),
  } as unknown as ITaxService
}

function buildInput(
  suggestions: ReorderSuggestionOutput[],
  reorderRules: ReorderRuleWithDetails[] = []
): CreateBulkReorderPurchaseOrderInput {
  return { suggestions, reorderRules, actor: ACTOR }
}

describe("CreateBulkReorderPurchaseOrderUseCase", () => {
  let poService: FakePOService
  let reorderService: IReorderService
  let supplierService: ISupplierService
  let notificationService: INotificationService
  let taxService: ITaxService

  beforeEach(() => {
    poService = makeFakePOService()
    reorderService = makeFakeReorderService()
    supplierService = makeFakeSupplierService()
    notificationService = makeFakeNotificationService()
    taxService = makeFakeTaxService()

    container.registerInstance(
      TOKENS.IPurchaseOrderService,
      poService as unknown as IPurchaseOrderService
    )
    container.registerInstance(TOKENS.IReorderService, reorderService)
    container.registerInstance(TOKENS.ISupplierService, supplierService)
    container.registerInstance(TOKENS.INotificationService, notificationService)
    container.registerInstance(TOKENS.ITaxService, taxService)
    container.registerSingleton(
      TOKENS.ICreateBulkReorderPurchaseOrderUseCase,
      CreateBulkReorderPurchaseOrderUseCase
    )
  })

  afterEach(() => {
    container.clearInstances()
    vi.clearAllMocks()
  })

  function resolve(): ICreateBulkReorderPurchaseOrderUseCase {
    return container.resolve<ICreateBulkReorderPurchaseOrderUseCase>(
      TOKENS.ICreateBulkReorderPurchaseOrderUseCase
    )
  }

  it("returns empty result when given no suggestions", async () => {
    const result = await resolve().execute(buildInput([]))
    expect(result.purchaseOrders).toEqual([])
    expect(result.skipped).toEqual([])
    expect(poService.createPurchaseOrder).not.toHaveBeenCalled()
  })

  it("uses real tax service (not hardcoded 0.08) for the PO subtotal", async () => {
    const suggestion = makeSuggestion({ estimatedCost: 1000 })
    await resolve().execute(buildInput([suggestion]))

    expect(taxService.calculatePurchaseOrderTax).toHaveBeenCalledWith("sup-1", 1000)
    expect(poService.createPurchaseOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: 1000,
        // 6.25% mocked rate, NOT 8%
        tax_amount: 62.5,
        total_amount: 1062.5,
      }),
      ACTOR.id
    )
  })

  it("groups suggestions by supplier into one PO per supplier", async () => {
    const supA1 = makeSuggestion({ materialTypeId: "mat-A1", supplierId: "sup-1" })
    const supA2 = makeSuggestion({
      materialTypeId: "mat-A2",
      supplierId: "sup-1",
      materialName: "Material A2",
    })
    const supB = makeSuggestion({
      materialTypeId: "mat-B",
      supplierId: "sup-2",
      supplierName: "Supplier Two",
      materialName: "Material B",
    })

    poService.createPurchaseOrder
      .mockResolvedValueOnce(makePO({ id: "po-1", supplier_id: "sup-1" }))
      .mockResolvedValueOnce(makePO({ id: "po-2", supplier_id: "sup-2" }))

    const result = await resolve().execute(buildInput([supA1, supA2, supB]))

    expect(result.purchaseOrders).toHaveLength(2)
    expect(poService.createPurchaseOrder).toHaveBeenCalledTimes(2)
    // 2 items on PO-1, 1 item on PO-2
    expect(poService.addItemToPurchaseOrder).toHaveBeenCalledTimes(3)
  })

  it("skips suggestions without a supplier with reason='no_supplier'", async () => {
    const withSup = makeSuggestion({ materialTypeId: "mat-A" })
    const noSup = makeSuggestion({
      materialTypeId: "mat-B",
      supplierId: undefined,
      supplierName: undefined,
      materialName: "Material B",
    })

    const result = await resolve().execute(buildInput([withSup, noSup]))

    expect(result.purchaseOrders).toHaveLength(1)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe("no_supplier")
    expect(result.skipped[0].suggestion.materialTypeId).toBe("mat-B")
  })

  it("on PO creation failure, skips ALL items in that supplier group with po_creation_failed", async () => {
    const supA1 = makeSuggestion({ materialTypeId: "mat-A1", supplierId: "sup-1" })
    const supA2 = makeSuggestion({
      materialTypeId: "mat-A2",
      supplierId: "sup-1",
      materialName: "Material A2",
    })
    const supB = makeSuggestion({
      materialTypeId: "mat-B",
      supplierId: "sup-2",
      supplierName: "Supplier Two",
    })

    poService.createPurchaseOrder
      .mockRejectedValueOnce(new Error("DB unique violation: po_number"))
      .mockResolvedValueOnce(makePO({ id: "po-2", supplier_id: "sup-2" }))

    const result = await resolve().execute(buildInput([supA1, supA2, supB]))

    expect(result.purchaseOrders).toHaveLength(1)
    expect(result.skipped).toHaveLength(2)
    expect(result.skipped.every((s) => s.reason === "po_creation_failed")).toBe(true)

    // Sanitized message — no raw error text leak.
    for (const s of result.skipped) {
      expect(s.message).not.toContain("DB unique violation")
      expect(s.message).not.toContain("po_number")
    }
  })

  it("on item-add failure, skips just that item with item_addition_failed (PO still returned)", async () => {
    const okItem = makeSuggestion({ materialTypeId: "mat-A1" })
    const badItem = makeSuggestion({
      materialTypeId: "mat-A2",
      supplierId: "sup-1",
      materialName: "Material A2",
    })

    poService.addItemToPurchaseOrder
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("FK violation: material_type_id"))

    const result = await resolve().execute(buildInput([okItem, badItem]))

    expect(result.purchaseOrders).toHaveLength(1)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe("item_addition_failed")
    expect(result.skipped[0].suggestion.materialTypeId).toBe("mat-A2")
    expect(result.skipped[0].message).not.toContain("FK violation")

    // coderabbit follow-up on PR #177: PO header totals were computed
    // from BOTH items but only one item is actually on the row. The
    // use-case must recompute via the service (reads DB items, re-runs
    // tax) so the header matches the rows.
    expect(poService.recalculatePOTotals).toHaveBeenCalledWith(result.purchaseOrders[0].id)
  })

  it("does NOT call recalculatePOTotals when all items succeed (avoid double tax-service call)", async () => {
    const items = [
      makeSuggestion({ materialTypeId: "mat-A1" }),
      makeSuggestion({ materialTypeId: "mat-A2", materialName: "Material A2" }),
    ]
    const result = await resolve().execute(buildInput(items))

    expect(result.purchaseOrders).toHaveLength(1)
    expect(result.skipped).toEqual([])
    // Recalc only fires on partial failure — no failures here means
    // the original computation is still authoritative.
    expect(poService.recalculatePOTotals).not.toHaveBeenCalled()
  })

  it("when all items fail to add, deletes the orphan PO row and excludes it from purchaseOrders[]", async () => {
    // coderabbit follow-up: previously, every-item-failed left an
    // empty draft PO with inflated totals. Now the use-case
    // best-effort deletes the orphan and doesn't return it.
    const item1 = makeSuggestion({ materialTypeId: "mat-A1" })
    const item2 = makeSuggestion({ materialTypeId: "mat-A2", materialName: "Material A2" })

    poService.addItemToPurchaseOrder
      .mockRejectedValueOnce(new Error("FK violation 1"))
      .mockRejectedValueOnce(new Error("FK violation 2"))

    const result = await resolve().execute(buildInput([item1, item2]))

    expect(result.purchaseOrders).toEqual([])
    expect(result.skipped).toHaveLength(2)
    expect(result.skipped.every((s) => s.reason === "item_addition_failed")).toBe(true)
    // Orphan PO row was cleaned up.
    expect(poService.deletePurchaseOrder).toHaveBeenCalledWith("po-1")
    // No recalculate — we deleted the row, no totals to fix.
    expect(poService.recalculatePOTotals).not.toHaveBeenCalled()
  })

  it("orphan-PO cleanup failure is non-fatal — bulk run still returns the skipped[] entries", async () => {
    const item = makeSuggestion()
    poService.addItemToPurchaseOrder.mockRejectedValueOnce(new Error("FK violation"))
    poService.deletePurchaseOrder.mockRejectedValueOnce(new Error("RLS denied delete"))

    const result = await resolve().execute(buildInput([item]))

    // Cleanup failed but the result still surfaces the failure to the
    // caller so they know the operation didn't succeed.
    expect(result.purchaseOrders).toEqual([])
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe("item_addition_failed")
  })

  it("threads actor.id into PO service writes", async () => {
    const suggestion = makeSuggestion()
    await resolve().execute(buildInput([suggestion]))

    expect(poService.createPurchaseOrder).toHaveBeenCalledWith(expect.any(Object), ACTOR.id)
    expect(poService.addItemToPurchaseOrder).toHaveBeenCalledWith(expect.any(Object), ACTOR.id)
  })

  it("bumps reorder rule last_triggered_at when a matching rule exists", async () => {
    const suggestion = makeSuggestion({ materialTypeId: "mat-A" })
    const rule = {
      id: "rule-A",
      material_type_id: "mat-A",
    } as ReorderRuleWithDetails

    await resolve().execute(buildInput([suggestion], [rule]))

    expect(reorderService.recordTrigger).toHaveBeenCalledWith("rule-A")
  })

  it("treats notification failures as non-fatal (PO is still returned, no throw)", async () => {
    ;(notificationService.sendReorderTriggered as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("smtp down")
    )

    const result = await resolve().execute(buildInput([makeSuggestion()]))
    expect(result.purchaseOrders).toHaveLength(1)
    expect(result.skipped).toHaveLength(0)
  })

  it("treats reorder-rule update failures as non-fatal", async () => {
    ;(reorderService.recordTrigger as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("rls denied")
    )
    const suggestion = makeSuggestion()
    const rule = { id: "rule-A", material_type_id: "mat-A" } as ReorderRuleWithDetails

    const result = await resolve().execute(buildInput([suggestion], [rule]))
    expect(result.purchaseOrders).toHaveLength(1)
    expect(result.skipped).toHaveLength(0)
  })

  // coderabbit follow-up on PR #177: the tax call sat outside the
  // per-supplier try, so a single tax-service throw aborted the entire
  // bulk run. Now scoped — failure pushes the supplier's items to
  // skipped[] with a stable reason and the loop continues.
  it("tax-service failure for one supplier doesn't break the bulk run", async () => {
    const supA = makeSuggestion({ materialTypeId: "mat-A", supplierId: "sup-1" })
    const supB = makeSuggestion({
      materialTypeId: "mat-B",
      supplierId: "sup-2",
      supplierName: "Supplier Two",
      materialName: "Material B",
    })

    ;(taxService.calculatePurchaseOrderTax as ReturnType<typeof vi.fn>).mockImplementation(
      async (supplierId: string, subtotal: number) => {
        if (supplierId === "sup-1") {
          throw new Error("ZipTax rate-limit exceeded for ZIP 12345")
        }
        return {
          subtotal,
          taxRate: 0.0625,
          taxAmount: subtotal * 0.0625,
          taxName: "Mocked Rate",
          taxLevel: "state",
          total: subtotal * 1.0625,
        }
      }
    )

    poService.createPurchaseOrder.mockResolvedValueOnce(
      makePO({ id: "po-2", supplier_id: "sup-2" })
    )

    const result = await resolve().execute(buildInput([supA, supB]))

    // sup-2 succeeded; sup-1 was skipped without aborting.
    expect(result.purchaseOrders).toHaveLength(1)
    expect(result.purchaseOrders[0].supplier_id).toBe("sup-2")
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe("tax_calculation_failed")
    expect(result.skipped[0].suggestion.materialTypeId).toBe("mat-A")

    // Sanitized message — raw error text doesn't leak.
    expect(result.skipped[0].message).not.toContain("ZipTax")
    expect(result.skipped[0].message).not.toContain("12345")

    // PO was never attempted for the failed supplier.
    const createdSupplierIds = poService.createPurchaseOrder.mock.calls.map(
      (call) => call[0].supplier_id
    )
    expect(createdSupplierIds).not.toContain("sup-1")
  })

  it("falls back to minimal supplier fields when getSupplierById throws", async () => {
    ;(supplierService.getSupplierById as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("rls denied")
    )

    await resolve().execute(buildInput([makeSuggestion()]))

    const call = poService.createPurchaseOrder.mock.calls[0][0]
    expect(call.order_date).toEqual(expect.any(String))
    // No payment_terms / shipping_address since lookup failed
    expect(call.payment_terms).toBeUndefined()
    expect(call.shipping_address).toBeUndefined()
  })
})
