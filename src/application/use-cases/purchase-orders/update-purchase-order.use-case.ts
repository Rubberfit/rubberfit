import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { ITaxService, TaxCalculation } from "@/src/application/services/tax.service.interface"
import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/database.types"
import { TOKENS } from "@/di/tokens"
import type { CreatePurchaseOrderItemInput } from "./create-purchase-order.use-case"

export interface UpdatePurchaseOrderInput {
  purchaseOrderId: string
  supplierId: string
  requestedDeliveryDate?: string
  paymentTerms?: string
  shippingAddress?: string
  billingAddress?: string
  notes?: string
  shippingCost?: number
  items: CreatePurchaseOrderItemInput[]
}

export interface UpdatePurchaseOrderResult {
  purchaseOrder: PurchaseOrderWithDetails
  taxCalculation: TaxCalculation
}

export interface IUpdatePurchaseOrderUseCase {
  execute(input: UpdatePurchaseOrderInput): Promise<UpdatePurchaseOrderResult>
}

@injectable()
export class UpdatePurchaseOrderUseCase implements IUpdatePurchaseOrderUseCase {
  constructor(
    @inject(TOKENS.IPurchaseOrderService) private readonly poService: IPurchaseOrderService,
    @inject(TOKENS.ITaxService) private readonly taxService: ITaxService
  ) {}

  async execute(input: UpdatePurchaseOrderInput): Promise<UpdatePurchaseOrderResult> {
    const subtotal = input.items.reduce((sum, i) => sum + i.quantitySqft * i.unitCost, 0)
    const taxCalc = await this.taxService.calculatePurchaseOrderTax(input.supplierId, subtotal)
    const shipping = input.shippingCost ?? 50

    const existing = await this.poService.getPurchaseOrderById(input.purchaseOrderId)
    for (const item of existing.items ?? []) {
      await this.poService.deletePurchaseOrderItem(item.id)
    }

    const updated = await this.poService.updatePurchaseOrder(input.purchaseOrderId, {
      supplier_id: input.supplierId,
      requested_delivery_date: input.requestedDeliveryDate,
      subtotal,
      tax_amount: taxCalc.taxAmount,
      shipping_cost: shipping,
      total_amount: subtotal + taxCalc.taxAmount + shipping,
      payment_terms: input.paymentTerms,
      shipping_address: input.shippingAddress,
      billing_address: input.billingAddress,
      notes: input.notes,
    })

    for (const item of input.items) {
      await this.poService.addItemToPurchaseOrder({
        purchase_order_id: input.purchaseOrderId,
        material_type_id: item.materialTypeId,
        description: item.description || "",
        quantity_sqft: item.quantitySqft,
        unit_cost: item.unitCost,
        width: item.width,
        thickness: item.thickness,
        color: item.color,
        notes: item.notes,
      })
    }

    return { purchaseOrder: updated, taxCalculation: taxCalc }
  }
}
