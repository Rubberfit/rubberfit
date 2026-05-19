import "reflect-metadata"
import { injectable, inject } from "tsyringe"

import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { ISupplierService } from "@/src/application/services/supplier.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import { ProfileId } from "@/src/entities/value-objects/id"
import { purchaseOrderEntityToLegacy } from "@/src/infrastructure/services/po-entity-to-legacy"
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
    @inject(TOKENS.IPurchaseOrderService)
    private readonly poService: IPurchaseOrderService,
    @inject(TOKENS.ISupplierService)
    private readonly supplierService: ISupplierService,
    @inject(TOKENS.INotificationService)
    private readonly notificationService: INotificationService
  ) {}

  async execute(input: RejectPurchaseOrderInput): Promise<PurchaseOrder> {
    const actorId = ProfileId.fromPersistence(input.actor.id)

    // Load BEFORE the transition so the notification can record the
    // old status (the entity's `rejectToDraft()` mutates in place).
    const before = await this.poService.getById(input.purchaseOrderId)
    const oldStatus = before.status

    const rejected = await this.poService.rejectToDraft(input.purchaseOrderId, actorId)

    // `input.reason` is captured by the action layer and surfaces on
    // the queued notification — the entity intentionally doesn't carry
    // a "rejection reason" field (it lives on the notification, not
    // the PO row). Reason isn't currently threaded into
    // `sendPOStatusUpdate` — same as before this migration.
    try {
      const supplier = await this.supplierService.getSupplierById(rejected.supplierId.value)
      await this.notificationService.sendPOStatusUpdate({
        actorId: input.actor.id,
        userIdentifier: input.actor.id,
        poNumber: rejected.poNumber,
        supplier: supplier.name,
        oldStatus,
        newStatus: "rejected",
      })
    } catch (error) {
      console.error("Failed to send PO rejection notification:", error)
    }

    return purchaseOrderEntityToLegacy(rejected, {
      id: rejected.supplierId.value,
      name: "",
    })
  }
}
