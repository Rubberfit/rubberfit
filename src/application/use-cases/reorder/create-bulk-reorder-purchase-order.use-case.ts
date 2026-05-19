import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IReorderService } from "@/src/application/services/reorder.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import type {
  PurchaseOrderWithDetails,
  ReorderRuleWithDetails,
} from "@/src/infrastructure/models/supabase"
import { TOKENS } from "@/di/tokens"
import type { ReorderSuggestionOutput } from "./generate-reorder-suggestions.use-case"
import type { ICreatePurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/create-purchase-order.use-case"

/**
 * Bulk variant of `CreateReorderPurchaseOrderUseCase`. Groups N
 * suggestions by `supplier_id` and emits one PO per supplier with
 * multiple line items.
 *
 * Design notes:
 *
 *   1. Partial-failure semantics. If supplier A succeeds and supplier
 *      B fails, we return the A PO and a `skipped` entry for the B
 *      items. Throwing on first failure would lose A. The UI mirrors
 *      this by toasting per success and per failure.
 *
 *   2. Atomic per-supplier creation. Each supplier's PO is created via
 *      `ICreatePurchaseOrderUseCase`, which constructs the entity with
 *      all items in one repo insert. This eliminates the orphan-PO and
 *      partial-item-failure modes the legacy two-call (createPO + N
 *      addItem) pattern had — the bulk use-case no longer needs
 *      per-item rollback, recalculation, or orphan cleanup logic.
 *
 *   3. Real tax calculation lives inside `ICreatePurchaseOrderUseCase`.
 *      Browser-side bulk path used to hardcode `0.08 * subtotal`; this
 *      delegation uses the real `taxService.calculatePurchaseOrderTax`.
 *
 *   4. Notifications. We mirror the single-PO behavior (per-item
 *      notification) so bulk and single produce consistent streams.
 *      Failures here are logged, not escalated.
 *
 *   5. Error sanitization. Use-case errors get logged with full
 *      detail server-side; the `skipped[].message` field returned to
 *      the client is a stable, sanitized string. Reason codes drive
 *      the UI; messages are for telemetry only.
 */

export type SkipReason = "no_supplier" | "po_creation_failed" | "tax_calculation_failed"

export interface SkippedSuggestion {
  /** Original suggestion that wasn't successfully ordered. */
  suggestion: ReorderSuggestionOutput
  /** Stable reason code for UI logic. */
  reason: SkipReason
  /** Sanitized human-readable message. NEVER includes raw error text. */
  message: string
}

export interface CreateBulkReorderPurchaseOrderInput {
  suggestions: ReorderSuggestionOutput[]
  reorderRules: ReorderRuleWithDetails[]
  actor: ActionActor
}

export interface CreateBulkReorderPurchaseOrderResult {
  /**
   * Successfully-created POs, in the order their supplier groups were
   * processed.
   */
  purchaseOrders: PurchaseOrderWithDetails[]
  /** Suggestions that didn't make it onto a PO. */
  skipped: SkippedSuggestion[]
}

export interface ICreateBulkReorderPurchaseOrderUseCase {
  execute(input: CreateBulkReorderPurchaseOrderInput): Promise<CreateBulkReorderPurchaseOrderResult>
}

const DELIVERY_WINDOW_DAYS = 7
const DEFAULT_ROLL_WIDTH_INCHES = 60
const DEFAULT_ROLL_THICKNESS_INCHES = 0.125

function groupBySupplier(suggestions: ReorderSuggestionOutput[]): {
  withSupplier: Map<string, ReorderSuggestionOutput[]>
  withoutSupplier: ReorderSuggestionOutput[]
} {
  const withSupplier = new Map<string, ReorderSuggestionOutput[]>()
  const withoutSupplier: ReorderSuggestionOutput[] = []
  for (const s of suggestions) {
    if (s.supplierId) {
      const existing = withSupplier.get(s.supplierId) ?? []
      existing.push(s)
      withSupplier.set(s.supplierId, existing)
    } else {
      withoutSupplier.push(s)
    }
  }
  return { withSupplier, withoutSupplier }
}

@injectable()
export class CreateBulkReorderPurchaseOrderUseCase implements ICreateBulkReorderPurchaseOrderUseCase {
  constructor(
    @inject(TOKENS.ICreatePurchaseOrderUseCase)
    private readonly createPoUseCase: ICreatePurchaseOrderUseCase,
    @inject(TOKENS.IReorderService) private readonly reorderService: IReorderService,
    @inject(TOKENS.INotificationService) private readonly notificationService: INotificationService
  ) {}

  async execute(
    input: CreateBulkReorderPurchaseOrderInput
  ): Promise<CreateBulkReorderPurchaseOrderResult> {
    const { suggestions, reorderRules, actor } = input

    const purchaseOrders: PurchaseOrderWithDetails[] = []
    const skipped: SkippedSuggestion[] = []

    const { withSupplier, withoutSupplier } = groupBySupplier(suggestions)
    for (const s of withoutSupplier) {
      skipped.push({
        suggestion: s,
        reason: "no_supplier",
        message: "No supplier configured for this material",
      })
    }

    for (const [, items] of withSupplier) {
      const deliveryDate = new Date(
        Date.now() + DELIVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000
      ).toISOString()

      const supplierIdForItems = items[0].supplierId
      if (!supplierIdForItems) {
        // Defensive — groupBySupplier should have filtered these.
        continue
      }

      let po: PurchaseOrderWithDetails
      try {
        const { purchaseOrder } = await this.createPoUseCase.execute({
          supplierId: supplierIdForItems,
          requestedDeliveryDate: deliveryDate,
          notes: `Bulk reorder for ${items.length} material${items.length > 1 ? "s" : ""}`,
          shippingCost: 0,
          items: items.map((item) => ({
            materialTypeId: item.materialTypeId,
            description: item.materialName,
            quantitySqft: item.suggestedQuantity,
            unitCost: item.estimatedCost / item.suggestedQuantity,
            width: DEFAULT_ROLL_WIDTH_INCHES,
            thickness: DEFAULT_ROLL_THICKNESS_INCHES,
          })),
          actor,
        })
        po = purchaseOrder
      } catch (error) {
        // Tax-service or PO-creation failure — emit a skipped entry per
        // item in this supplier group and proceed to the next supplier.
        // The legacy implementation distinguished tax-calc failure from
        // PO-creation failure; with the delegated path we can't reliably
        // tell them apart at this boundary, so we use a more generic
        // reason. Server-side logs carry the full error.
        const isTaxError = error instanceof Error && /tax/i.test(error.message)
        const reason: SkipReason = isTaxError ? "tax_calculation_failed" : "po_creation_failed"
        const message = isTaxError
          ? `Could not calculate tax for ${items[0].supplierName ?? "supplier"}`
          : `Could not create purchase order for ${items[0].supplierName ?? "supplier"}`
        console.error(
          `[bulk-reorder] createPurchaseOrder use-case failed for supplier ${supplierIdForItems}:`,
          error
        )
        for (const item of items) {
          skipped.push({ suggestion: item, reason, message })
        }
        continue
      }

      purchaseOrders.push(po)

      for (const item of items) {
        const rule = reorderRules.find((r) => r.material_type_id === item.materialTypeId)
        if (rule) {
          try {
            await this.reorderService.recordTrigger(rule.id)
          } catch (error) {
            // Non-fatal — the PO is created; rule timestamp is just stale.
            console.error(`[bulk-reorder] recordTrigger failed for rule ${rule.id}:`, error)
          }
        }

        try {
          await this.notificationService.sendReorderTriggered({
            actorId: actor.id,
            userIdentifier: actor.id,
            materialName: item.materialName,
            reorderQuantity: item.suggestedQuantity,
            supplier: item.supplierName ?? "Unknown supplier",
            poNumber: po.po_number,
          })
        } catch (error) {
          // Non-fatal — notification failure shouldn't roll back the PO.
          console.error(
            `[bulk-reorder] sendReorderTriggered failed for material ${item.materialTypeId}:`,
            error
          )
        }
      }
    }

    return { purchaseOrders, skipped }
  }
}
