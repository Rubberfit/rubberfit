import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { IReorderService } from "@/src/application/services/reorder.service.interface"
import type { ISupplierService } from "@/src/application/services/supplier.service.interface"
import type {
  PurchaseOrderWithDetails,
  ReorderRuleWithDetails,
} from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import { notificationService } from "@/src/infrastructure/services/notificationService"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"
import { reorderService } from "@/src/infrastructure/services/reorderService"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import type { ReorderSuggestionOutput } from "./generate-reorder-suggestions.use-case"

export interface CreateReorderPurchaseOrderInput {
  suggestion: ReorderSuggestionOutput
  reorderRules: ReorderRuleWithDetails[]
}

export interface CreateReorderPurchaseOrderResult {
  purchaseOrder: PurchaseOrderWithDetails
}

const DELIVERY_WINDOW_DAYS = 7
const DEFAULT_TAX_RATE = 0.08
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

export class CreateReorderPurchaseOrderUseCase {
  constructor(
    private readonly poService: IPurchaseOrderService,
    private readonly reorderService: IReorderService,
    private readonly supplierService: ISupplierService,
    private readonly notificationService: INotificationService
  ) {}

  async execute(input: CreateReorderPurchaseOrderInput): Promise<CreateReorderPurchaseOrderResult> {
    const { suggestion, reorderRules } = input

    if (!suggestion.supplierId) {
      throw new Error("No supplier configured for this material")
    }

    let supplierFields: Record<string, string | undefined> = {
      order_date: new Date().toISOString(),
    }
    try {
      const supplier = await this.supplierService.getSupplierById(suggestion.supplierId)
      if (supplier) {
        const address = buildSupplierAddress(supplier)
        supplierFields = {
          order_date: new Date().toISOString(),
          payment_terms: supplier.payment_terms || undefined,
          shipping_address: address || undefined,
          billing_address: address || undefined,
        }
      }
    } catch (_error) {
      // Keep minimal supplierFields
    }

    const subtotal = suggestion.estimatedCost
    const taxAmount = subtotal * DEFAULT_TAX_RATE
    const deliveryDate = new Date(
      Date.now() + DELIVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString()

    const po = await this.poService.createPurchaseOrder({
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
    })

    if (!po) throw new Error("Failed to create purchase order")

    await this.poService.addItemToPurchaseOrder({
      purchase_order_id: po.id,
      material_type_id: suggestion.materialTypeId,
      description: suggestion.materialName,
      quantity_sqft: suggestion.suggestedQuantity,
      unit_cost: suggestion.estimatedCost / suggestion.suggestedQuantity,
      width: DEFAULT_ROLL_WIDTH,
      thickness: DEFAULT_ROLL_THICKNESS,
    })

    const rule = reorderRules.find((r) => r.material_type_id === suggestion.materialTypeId)
    if (rule) {
      await this.reorderService.updateReorderRule(rule.id, {
        last_triggered_at: new Date().toISOString(),
      })
    }

    try {
      const userId = await getCurrentUserId()
      await this.notificationService.sendReorderTriggered({
        userIdentifier: userId,
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

export const createReorderPurchaseOrderUseCase = new CreateReorderPurchaseOrderUseCase(
  purchaseOrderService,
  reorderService,
  supplierService,
  notificationService
)
