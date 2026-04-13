import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { PurchaseOrder } from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import { notificationService } from "@/src/infrastructure/services/notificationService"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"

export interface ApprovePurchaseOrderInput {
  purchaseOrderId: string
}

export class ApprovePurchaseOrderUseCase {
  constructor(
    private readonly poService: IPurchaseOrderService,
    private readonly notificationService: INotificationService
  ) {}

  async execute(input: ApprovePurchaseOrderInput): Promise<PurchaseOrder> {
    const [existing, userId] = await Promise.all([
      this.poService.getPurchaseOrderById(input.purchaseOrderId),
      getCurrentUserId(),
    ])
    const approved = await this.poService.approvePurchaseOrder(input.purchaseOrderId, userId)

    try {
      await this.notificationService.sendPOStatusUpdate({
        userIdentifier: userId,
        poNumber: existing.po_number,
        supplier: existing.supplier?.name ?? "Unknown supplier",
        oldStatus: existing.status,
        newStatus: "approved",
      })
    } catch (error) {
      console.error("Failed to send PO approval notification:", error)
    }

    return approved
  }
}

export const approvePurchaseOrderUseCase = new ApprovePurchaseOrderUseCase(
  purchaseOrderService,
  notificationService
)
