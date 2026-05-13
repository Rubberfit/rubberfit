import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type {
  ILegacyPurchaseOrderService,
  POReceiptItem,
  POReceiptResult,
} from "@/src/application/services/legacy-purchase-order.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import { TOKENS } from "@/di/tokens"

export interface ReceivePurchaseOrderInput {
  purchaseOrderId: string
  items: POReceiptItem[]
  actor: ActionActor
}

export interface IReceivePurchaseOrderUseCase {
  execute(input: ReceivePurchaseOrderInput): Promise<POReceiptResult>
}

@injectable()
export class ReceivePurchaseOrderUseCase implements IReceivePurchaseOrderUseCase {
  constructor(
    @inject(TOKENS.ILegacyPurchaseOrderService)
    private readonly poService: ILegacyPurchaseOrderService,
    @inject(TOKENS.INotificationService) private readonly notificationService: INotificationService
  ) {}

  async execute(input: ReceivePurchaseOrderInput): Promise<POReceiptResult> {
    const existing = await this.poService.getPurchaseOrderById(input.purchaseOrderId)
    // Always attribute the receipt to the authenticated actor — never
    // a client-supplied uuid. Quantity updates run before RLS would
    // catch a forged user_id on the roll insert (Daniel review #177),
    // so accepting a separate `receivedBy` here would let a caller
    // attribute the receive to someone else and leave partial state.
    const result = await this.poService.receivePurchaseOrder(
      input.purchaseOrderId,
      input.items,
      input.actor.id
    )

    if (!result.partialReceipt) {
      try {
        await this.notificationService.sendPOStatusUpdate({
          actorId: input.actor.id,
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
