import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { PurchaseOrder } from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import { notificationService } from "@/src/infrastructure/services/notificationService"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"

export interface RejectPurchaseOrderInput {
  purchaseOrderId: string
  reason?: string
}

export class RejectPurchaseOrderUseCase {
  constructor(
    private readonly poService: IPurchaseOrderService,
    private readonly notificationService: INotificationService
  ) {}

  async execute(input: RejectPurchaseOrderInput): Promise<PurchaseOrder> {
    const [existing, userId] = await Promise.all([
      this.poService.getPurchaseOrderById(input.purchaseOrderId),
      getCurrentUserId(),
    ])
    const rejected = await this.poService.rejectPurchaseOrder(
      input.purchaseOrderId,
      userId,
      input.reason
    )

    try {
      await this.notificationService.sendPOStatusUpdate({
        userIdentifier: userId,
        poNumber: existing.po_number,
        supplier: existing.supplier?.name ?? "Unknown supplier",
        oldStatus: existing.status,
        newStatus: "rejected",
      })
    } catch (error) {
      console.error("Failed to send PO rejection notification:", error)
    }

    return rejected
  }
}

export const rejectPurchaseOrderUseCase = new RejectPurchaseOrderUseCase(
  purchaseOrderService,
  notificationService
)
