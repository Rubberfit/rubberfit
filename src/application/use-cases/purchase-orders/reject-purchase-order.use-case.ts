import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { PurchaseOrder } from "@/src/entities"
import { TOKENS } from "@/di/tokens"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"

export interface RejectPurchaseOrderInput {
  purchaseOrderId: string
  reason?: string
}

export interface IRejectPurchaseOrderUseCase {
  execute(input: RejectPurchaseOrderInput): Promise<PurchaseOrder>
}

@injectable()
export class RejectPurchaseOrderUseCase implements IRejectPurchaseOrderUseCase {
  constructor(
    @inject(TOKENS.IPurchaseOrderService) private readonly poService: IPurchaseOrderService,
    @inject(TOKENS.INotificationService) private readonly notificationService: INotificationService
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
