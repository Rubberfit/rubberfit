import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import type { PurchaseOrder } from "@/src/infrastructure/models/supabase"
import { TOKENS } from "@/di/tokens"

export interface ApprovePurchaseOrderInput {
  purchaseOrderId: string
  actor: ActionActor
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
    const existing = await this.poService.getPurchaseOrderById(input.purchaseOrderId)
    const approved = await this.poService.approvePurchaseOrder(
      input.purchaseOrderId,
      input.actor.id
    )

    try {
      await this.notificationService.sendPOStatusUpdate({
        actorId: input.actor.id,
        userIdentifier: input.actor.id,
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
