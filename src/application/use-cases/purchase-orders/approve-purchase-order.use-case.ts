import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { PurchaseOrder } from "@/src/entities"
import { TOKENS } from "@/di/tokens"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"

export interface ApprovePurchaseOrderInput {
  purchaseOrderId: string
}

export interface IApprovePurchaseOrderUseCase {
  execute(input: ApprovePurchaseOrderInput): Promise<PurchaseOrder>
}

@injectable()
export class ApprovePurchaseOrderUseCase implements IApprovePurchaseOrderUseCase {
  constructor(
    @inject(TOKENS.IPurchaseOrderService) private readonly poService: IPurchaseOrderService,
    @inject(TOKENS.INotificationService) private readonly notificationService: INotificationService
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
