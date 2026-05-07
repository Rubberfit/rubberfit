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

export type SkipReason = "no_supplier" | "po_creation_failed" | "item_addition_failed"

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

function buildSupplierAddress(s: {
  address?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  country?: string | null
}): string {
  const parts = [s.address, s.city, s.state, s.zip_code, s.country].filter(Boolean)
  return parts.join(", ")
}

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
      const taxCalc = await this.taxService.calculatePurchaseOrderTax(supplierId, subtotal)
      const taxAmount = taxCalc.taxAmount
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

      purchaseOrders.push(po)

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

        const rule = reorderRules.find((r) => r.material_type_id === item.materialTypeId)
        if (rule) {
          try {
            await this.reorderService.updateReorderRule(
              rule.id,
              { last_triggered_at: new Date().toISOString() },
              actor.id
            )
          } catch (error) {
            // Non-fatal — the PO is created; rule timestamp is just stale.
            console.error(`[bulk-reorder] updateReorderRule failed for rule ${rule.id}:`, error)
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

  private async resolveSupplierFields(
    supplierId: string
  ): Promise<Record<string, string | undefined>> {
    const orderDate = new Date().toISOString()
    try {
      const supplier = await this.supplierService.getSupplierById(supplierId)
      if (!supplier) return { order_date: orderDate }
      const address = buildSupplierAddress(supplier)
      return {
        order_date: orderDate,
        payment_terms: supplier.payment_terms || undefined,
        shipping_address: address || undefined,
        billing_address: address || undefined,
      }
    } catch (_error) {
      return { order_date: orderDate }
    }
  }
}
