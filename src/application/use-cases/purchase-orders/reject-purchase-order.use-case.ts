import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import type { PurchaseOrder } from "@/src/infrastructure/models/supabase"
import { TOKENS } from "@/di/tokens"

export interface RejectPurchaseOrderInput {
  purchaseOrderId: string
  reason?: string
  actor: ActionActor
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
    const existing = await this.poService.getPurchaseOrderById(input.purchaseOrderId)
    const rejected = await this.poService.rejectPurchaseOrder(
      input.purchaseOrderId,
      input.actor.id,
      input.reason
    )

    try {
      await this.notificationService.sendPOStatusUpdate({
        userIdentifier: input.actor.id,
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
