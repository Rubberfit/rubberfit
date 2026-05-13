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

export interface CreateReorderPurchaseOrderInput {
  suggestion: ReorderSuggestionOutput
  reorderRules: ReorderRuleWithDetails[]
  actor: ActionActor
}

export interface CreateReorderPurchaseOrderResult {
  purchaseOrder: PurchaseOrderWithDetails
}

export interface ICreateReorderPurchaseOrderUseCase {
  execute(input: CreateReorderPurchaseOrderInput): Promise<CreateReorderPurchaseOrderResult>
}

const DELIVERY_WINDOW_DAYS = 7
const DEFAULT_ROLL_WIDTH = 60
const DEFAULT_ROLL_THICKNESS = 0.125

@injectable()
export class CreateReorderPurchaseOrderUseCase implements ICreateReorderPurchaseOrderUseCase {
  constructor(
    @inject(TOKENS.IPurchaseOrderService) private readonly poService: IPurchaseOrderService,
    @inject(TOKENS.IReorderService) private readonly reorderService: IReorderService,
    @inject(TOKENS.ISupplierService) private readonly supplierService: ISupplierService,
    @inject(TOKENS.INotificationService) private readonly notificationService: INotificationService,
    @inject(TOKENS.ITaxService) private readonly taxService: ITaxService
  ) {}

  async execute(input: CreateReorderPurchaseOrderInput): Promise<CreateReorderPurchaseOrderResult> {
    const { suggestion, reorderRules } = input

    if (!suggestion.supplierId) {
      throw new Error("No supplier configured for this material")
    }

    // Address fields would come from supplier.addressId → addresses
    // repository, which is not yet wired into this use-case. The
    // legacy flat-address columns (`supplier.address`, `.city`, …)
    // no longer exist on the entity. Skipping shipping/billing
    // address means operators get an empty header that they fill in
    // on review — surfacing a real follow-up rather than silently
    // populating from stale data.
    let supplierFields: Record<string, string | undefined> = {
      order_date: new Date().toISOString(),
    }
    try {
      const supplier = await this.supplierService.getSupplierById(suggestion.supplierId)
      supplierFields = {
        order_date: new Date().toISOString(),
        payment_terms: supplier.paymentTerms ?? undefined,
      }
    } catch (_error) {
      // Keep minimal supplierFields
    }

    const subtotal = suggestion.estimatedCost
    const taxCalc = await this.taxService.calculatePurchaseOrderTax(suggestion.supplierId, subtotal)
    const taxAmount = taxCalc.taxAmount
    const deliveryDate = new Date(
      Date.now() + DELIVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()

    const po = await this.poService.createPurchaseOrder(
      {
        supplier_id: suggestion.supplierId,
        status: "draft",
        ...supplierFields,
        requested_delivery_date: deliveryDate,
        notes: `Reorder for ${suggestion.materialName} - ${suggestion.urgencyLevel} priority`,
        subtotal,
        tax_amount: taxAmount,
        shipping_cost: 0,
        total_amount: subtotal + taxAmount,
        auto_generated: false,
      },
      input.actor.id
    )

    if (!po) throw new Error("Failed to create purchase order")

    await this.poService.addItemToPurchaseOrder(
      {
        purchase_order_id: po.id,
        material_type_id: suggestion.materialTypeId,
        description: suggestion.materialName,
        quantity_sqft: suggestion.suggestedQuantity,
        unit_cost: suggestion.estimatedCost / suggestion.suggestedQuantity,
        width: DEFAULT_ROLL_WIDTH,
        thickness: DEFAULT_ROLL_THICKNESS,
      },
      input.actor.id
    )

    const rule = reorderRules.find((r) => r.material_type_id === suggestion.materialTypeId)
    if (rule) {
      await this.reorderService.recordTrigger(rule.id)
    }

    try {
      await this.notificationService.sendReorderTriggered({
        actorId: input.actor.id,
        userIdentifier: input.actor.id,
        materialName: suggestion.materialName,
        reorderQuantity: suggestion.suggestedQuantity,
        supplier: suggestion.supplierName ?? "Unknown supplier",
        poNumber: po.po_number,
      })
    } catch (error) {
      console.error("Failed to send reorder notification:", error)
    }

    return { purchaseOrder: po }
  }
}
