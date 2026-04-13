import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { ITaxService, TaxCalculation } from "@/src/application/services/tax.service.interface"
import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"
import { taxService } from "@/src/infrastructure/services/taxService"

export interface CreatePurchaseOrderItemInput {
  materialTypeId: string
  description?: string
  quantitySqft: number
  unitCost: number
  width?: number
  thickness?: number
  color?: string
  notes?: string
}

export interface CreatePurchaseOrderInput {
  supplierId: string
  requestedDeliveryDate?: string
  paymentTerms?: string
  shippingAddress?: string
  billingAddress?: string
  notes?: string
  shippingCost?: number
  items: CreatePurchaseOrderItemInput[]
}

export interface CreatePurchaseOrderResult {
  purchaseOrder: PurchaseOrderWithDetails
  taxCalculation: TaxCalculation
}

export class CreatePurchaseOrderUseCase {
  constructor(
    private readonly poService: IPurchaseOrderService,
    private readonly taxService: ITaxService
  ) {}

  async execute(input: CreatePurchaseOrderInput): Promise<CreatePurchaseOrderResult> {
    const subtotal = input.items.reduce((sum, i) => sum + i.quantitySqft * i.unitCost, 0)
    const taxCalc = await this.taxService.calculatePurchaseOrderTax(input.supplierId, subtotal)
    const shipping = input.shippingCost ?? 50

    const po = await this.poService.createPurchaseOrder({
      supplier_id: input.supplierId,
      status: "draft",
      order_date: new Date().toISOString(),
      requested_delivery_date: input.requestedDeliveryDate,
      subtotal,
      tax_amount: taxCalc.taxAmount,
      shipping_cost: shipping,
      total_amount: subtotal + taxCalc.taxAmount + shipping,
      payment_terms: input.paymentTerms,
      shipping_address: input.shippingAddress,
      billing_address: input.billingAddress,
      notes: input.notes,
      auto_generated: false,
    })

    if (!po) throw new Error("Failed to create purchase order")

    for (const item of input.items) {
      await this.poService.addItemToPurchaseOrder({
        purchase_order_id: po.id,
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

    return { purchaseOrder: po, taxCalculation: taxCalc }
  }
}

export const createPurchaseOrderUseCase = new CreatePurchaseOrderUseCase(
  purchaseOrderService,
  taxService
)
