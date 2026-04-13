import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type {
  IPurchaseOrderService,
  POReceiptItem,
  POReceiptResult,
} from "@/src/application/services/purchase-order.service.interface"
import { TOKENS } from "@/di/tokens"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"

export interface ReceivePurchaseOrderInput {
  purchaseOrderId: string
  items: POReceiptItem[]
  receivedBy?: string
}

export interface IReceivePurchaseOrderUseCase {
  execute(input: ReceivePurchaseOrderInput): Promise<POReceiptResult>
}

@injectable()
export class ReceivePurchaseOrderUseCase implements IReceivePurchaseOrderUseCase {
  constructor(
    @inject(TOKENS.IPurchaseOrderService) private readonly poService: IPurchaseOrderService,
    @inject(TOKENS.INotificationService) private readonly notificationService: INotificationService
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
