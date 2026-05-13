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
    @inject(TOKENS.IPurchaseOrderService)
    private readonly poService: IPurchaseOrderService,
    @inject(TOKENS.ISupplierService)
    private readonly supplierService: ISupplierService,
    @inject(TOKENS.INotificationService)
    private readonly notificationService: INotificationService
  ) {}

  async execute(input: ApprovePurchaseOrderInput): Promise<PurchaseOrder> {
    const actorId = ProfileId.fromPersistence(input.actor.id)

    // Load the aggregate BEFORE the transition so the notification can
    // record the old status — the entity's `approve()` mutates in
    // place, so reading status afterwards would always read "approved".
    const before = await this.poService.getById(input.purchaseOrderId)
    const oldStatus = before.status

    const approved = await this.poService.approve(input.purchaseOrderId, actorId)

    // Supplier name comes from the supplier aggregate, not from the PO
    // (entity only carries `supplierId`). Notification failure is
    // logged-and-swallowed: a missing notification shouldn't roll back
    // the approval.
    try {
      const supplier = await this.supplierService.getSupplierById(approved.supplierId.value)
      await this.notificationService.sendPOStatusUpdate({
        actorId: input.actor.id,
        userIdentifier: input.actor.id,
        poNumber: approved.poNumber,
        supplier: supplier.name,
        oldStatus,
        newStatus: "approved",
      })
    } catch (error) {
      console.error("Failed to send PO approval notification:", error)
    }

    return purchaseOrderEntityToLegacy(approved, {
      id: approved.supplierId.value,
      name: "",
    })
  }
}
