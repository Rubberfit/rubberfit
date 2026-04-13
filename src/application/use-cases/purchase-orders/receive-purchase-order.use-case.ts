import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type {
  IPurchaseOrderService,
  POReceiptItem,
  POReceiptResult,
} from "@/src/application/services/purchase-order.service.interface"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import { notificationService } from "@/src/infrastructure/services/notificationService"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"

export interface ReceivePurchaseOrderInput {
  purchaseOrderId: string
  items: POReceiptItem[]
  receivedBy?: string
}

export class ReceivePurchaseOrderUseCase {
  constructor(
    private readonly poService: IPurchaseOrderService,
    private readonly notificationService: INotificationService
  ) {}

  async execute(input: ReceivePurchaseOrderInput): Promise<POReceiptResult> {
    const [existing, userId] = await Promise.all([
      this.poService.getPurchaseOrderById(input.purchaseOrderId),
      getCurrentUserId(),
    ])
    const result = await this.poService.receivePurchaseOrder(
      input.purchaseOrderId,
      input.items,
      input.receivedBy ?? userId
    )

    if (!result.partialReceipt) {
      try {
        await this.notificationService.sendPOStatusUpdate({
          userIdentifier: userId,
          poNumber: existing.po_number,
          supplier: existing.supplier?.name ?? "Unknown supplier",
          oldStatus: existing.status,
          newStatus: "received",
        })
      } catch (error) {
        console.error("Failed to send PO received notification:", error)
      }
    }

    return result
  }
}

export const receivePurchaseOrderUseCase = new ReceivePurchaseOrderUseCase(
  purchaseOrderService,
  notificationService
)
