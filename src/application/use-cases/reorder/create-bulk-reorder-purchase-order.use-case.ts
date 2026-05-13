import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { IReorderService } from "@/src/application/services/reorder.service.interface"
import type { ISupplierService } from "@/src/application/services/supplier.service.interface"
import type { ITaxService } from "@/src/application/services/tax.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import type {
  PurchaseOrderWithDetails,
  ReorderRuleWithDetails,
} from "@/src/infrastructure/models/supabase"
import { TOKENS } from "@/di/tokens"
import type { ReorderSuggestionOutput } from "./generate-reorder-suggestions.use-case"

/**
 * Bulk variant of `CreateReorderPurchaseOrderUseCase`. Groups N
 * suggestions by `supplier_id` and emits one PO per supplier with
 * multiple line items.
 *
 * Design notes (see Codex review on the migration PR):
 *
 *   1. Partial-failure semantics. If supplier A succeeds and supplier
 *      B fails, we return the A PO and a `skipped` entry for the B
 *      items. Throwing on first failure would lose A. The UI mirrors
 *      this by toasting per success and per failure.
 *
 *   2. No transaction wrapping. Same as the single-PO use-case — if
 *      `createPurchaseOrder` succeeds and `addItemToPurchaseOrder`
 *      fails, the PO row stays in the DB with partial items. Bringing
 *      transactions in is a separate behavior change tracked as a
 *      follow-up; this migration preserves current semantics.
 *
 *   3. Real tax calculation. The current browser-side bulk path
 *      hardcodes `tax_amount = totalCost * 0.08`, ignoring supplier
 *      tax-exempt status, override rates, and ZipTax API rates. Moving
 *      to `taxService.calculatePurchaseOrderTax` is a deliberate
 *      correctness fix bundled with the security migration.
 *
 *   4. Notifications. The current bulk path sends NO notifications,
 *      which is itself a bug — single-PO sends one per material via
 *      `sendReorderTriggered`. We mirror the single-PO behavior
 *      (per-item notification) so bulk and single produce consistent
 *      notification streams. Failures here are logged, not escalated.
 *
 *   5. Error sanitization. Service-layer errors get logged with full
 *      detail server-side (`console.error`) but the `skipped[].message`
 *      field returned to the client is a stable, sanitized string —
 *      never raw Supabase error text. Reason codes drive the UI;
 *      messages are for telemetry only.
 */

export type SkipReason =
  | "no_supplier"
  | "po_creation_failed"
  | "item_addition_failed"
  | "tax_calculation_failed"

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
   * processed. Each PO may have fewer items than its source group —
   * see `skipped` for items whose `addItemToPurchaseOrder` call failed
   * after the PO row was already inserted.
   */
  purchaseOrders: PurchaseOrderWithDetails[]
  /** Suggestions that didn't make it onto a PO. */
  skipped: SkippedSuggestion[]
}

export interface ICreateBulkReorderPurchaseOrderUseCase {
  execute(input: CreateBulkReorderPurchaseOrderInput): Promise<CreateBulkReorderPurchaseOrderResult>
}

const DELIVERY_WINDOW_DAYS = 7
const DEFAULT_ROLL_WIDTH = 60
const DEFAULT_ROLL_THICKNESS = 0.125

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
    @inject(TOKENS.IPurchaseOrderService) private readonly poService: IPurchaseOrderService,
    @inject(TOKENS.IReorderService) private readonly reorderService: IReorderService,
    @inject(TOKENS.ISupplierService) private readonly supplierService: ISupplierService,
    @inject(TOKENS.INotificationService) private readonly notificationService: INotificationService,
    @inject(TOKENS.ITaxService) private readonly taxService: ITaxService
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

    for (const [supplierId, items] of withSupplier) {
      const subtotal = items.reduce((sum, item) => sum + item.estimatedCost, 0)
      const supplierFields = await this.resolveSupplierFields(supplierId)

      // Tax-service failures (ZipTax rate-limit, bad zip lookup,
      // network blip) used to throw out of the whole bulk loop and
      // discard every other supplier's PO — defeating the
      // partial-failure design above. Scope the catch to this
      // supplier so the rest still proceed. (coderabbit follow-up
      // on PR #177.)
      let taxAmount: number
      try {
        const taxCalc = await this.taxService.calculatePurchaseOrderTax(supplierId, subtotal)
        taxAmount = taxCalc.taxAmount
      } catch (error) {
        console.error(
          `[bulk-reorder] calculatePurchaseOrderTax failed for supplier ${supplierId}:`,
          error
        )
        for (const item of items) {
          skipped.push({
            suggestion: item,
            reason: "tax_calculation_failed",
            message: `Could not calculate tax for ${item.supplierName ?? "supplier"}`,
          })
        }
        continue
      }

      const deliveryDate = new Date(
        Date.now() + DELIVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000
      ).toISOString()

      let po: PurchaseOrderWithDetails
      try {
        po = await this.poService.createPurchaseOrder(
          {
            supplier_id: supplierId,
            status: "draft",
            ...supplierFields,
            requested_delivery_date: deliveryDate,
            notes: `Bulk reorder for ${items.length} material${items.length > 1 ? "s" : ""}`,
            subtotal,
            tax_amount: taxAmount,
            shipping_cost: 0,
            total_amount: subtotal + taxAmount,
            auto_generated: false,
          },
          actor.id
        )
      } catch (error) {
        // Log raw error server-side; client gets a stable message.
        console.error(
          `[bulk-reorder] createPurchaseOrder failed for supplier ${supplierId}:`,
          error
        )
        for (const item of items) {
          skipped.push({
            suggestion: item,
            reason: "po_creation_failed",
            message: `Could not create purchase order for ${item.supplierName ?? "supplier"}`,
          })
        }
        continue
      }

      // Track which items actually landed on the PO. The header
      // `subtotal` / `tax_amount` / `total_amount` were computed from
      // ALL items above; if any insert fails we need to either
      // recompute the header (partial success) or clean up the orphan
      // PO row (full failure). Deferring `purchaseOrders.push(po)`
      // until after the loop also keeps an empty PO out of the
      // returned result. (coderabbit follow-up on PR #177.)
      const successfulItems: ReorderSuggestionOutput[] = []

      for (const item of items) {
        try {
          await this.poService.addItemToPurchaseOrder(
            {
              purchase_order_id: po.id,
              material_type_id: item.materialTypeId,
              description: item.materialName,
              quantity_sqft: item.suggestedQuantity,
              unit_cost: item.estimatedCost / item.suggestedQuantity,
              width: DEFAULT_ROLL_WIDTH,
              thickness: DEFAULT_ROLL_THICKNESS,
            },
            actor.id
          )
        } catch (error) {
          console.error(
            `[bulk-reorder] addItemToPurchaseOrder failed for PO ${po.id}, material ${item.materialTypeId}:`,
            error
          )
          skipped.push({
            suggestion: item,
            reason: "item_addition_failed",
            message: `Could not add ${item.materialName} to purchase order`,
          })
          continue
        }

        successfulItems.push(item)

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

      if (successfulItems.length === 0) {
        // Every item-add failed for this supplier. The PO row exists
        // with header totals computed from items that aren't there.
        // Best-effort cleanup; if the delete itself fails the operator
        // sees an orphan empty draft, but the items were already
        // surfaced as `skipped` so they know what happened.
        try {
          await this.poService.deletePurchaseOrder(po.id)
        } catch (error) {
          console.error(
            `[bulk-reorder] cleanup deletePurchaseOrder failed for orphan ${po.id}:`,
            error
          )
        }
        continue
      }

      purchaseOrders.push(po)

      if (successfulItems.length < items.length) {
        // Partial success: PO header `subtotal/tax_amount/total_amount`
        // was computed from items.length but only successfulItems are
        // actually on the row. Recompute from the rows that landed.
        // `recalculatePOTotals` re-reads the items table and re-runs
        // the tax service — failure here is non-fatal (header stays
        // over-counted; operator can hit "Recalculate" manually).
        try {
          await this.poService.recalculatePOTotals(po.id)
        } catch (error) {
          console.error(
            `[bulk-reorder] recalculatePOTotals failed for PO ${po.id} after partial item loss:`,
            error
          )
        }
      }
    }

    return { purchaseOrders, skipped }
  }

  private async resolveSupplierFields(
    supplierId: string
  ): Promise<Record<string, string | undefined>> {
    const orderDate = new Date().toISOString()
    try {
      const supplier = await this.supplierService.getSupplierById(supplierId)
      // Address fields would come from supplier.addressId → addresses
      // repository, not yet wired here. Operators fill the empty
      // shipping/billing on review.
      return {
        order_date: orderDate,
        payment_terms: supplier.paymentTerms ?? undefined,
      }
    } catch (_error) {
      return { order_date: orderDate }
    }
  }
}
