import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type {
  IPurchaseOrderService,
  POReceiptItem,
  POReceiptResult,
} from "@/src/application/services/purchase-order.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import { TOKENS } from "@/di/tokens"

export interface ReceivePurchaseOrderInput {
  purchaseOrderId: string
  items: POReceiptItem[]
  receivedBy?: string
  actor: ActionActor
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
    const existing = await this.poService.getPurchaseOrderById(input.purchaseOrderId)
    const result = await this.poService.receivePurchaseOrder(
      input.purchaseOrderId,
      input.items,
      input.receivedBy ?? input.actor.id
    )

    if (!result.partialReceipt) {
      try {
        await this.notificationService.sendPOStatusUpdate({
          userIdentifier: input.actor.id,
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
