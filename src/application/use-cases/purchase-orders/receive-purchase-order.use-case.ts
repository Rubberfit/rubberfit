import "reflect-metadata"
import { randomUUID } from "node:crypto"
import { injectable, inject } from "tsyringe"

import type { ActionActor } from "@/src/application/types/action-actor"
import type {
  IPurchaseOrderService,
  ReceiptDeltaByItemId,
} from "@/src/application/services/purchase-order.service.interface"
import type { IRollService } from "@/src/application/services/roll.service.interface"
import type { ISupplierService } from "@/src/application/services/supplier.service.interface"
import type { INotificationService } from "@/src/application/services/notification.service.interface"
import type {
  POReceiptResult,
  POReceiptItem,
} from "@/src/application/services/legacy-purchase-order.service.interface"
import type { Roll as LegacyRoll } from "@/src/infrastructure/models/supabase"
import { ProfileId, RollId } from "@/src/entities/value-objects/id"
import {
  buildCreateRollProps,
  sqftToSqm,
} from "@/src/application/use-cases/purchase-orders/po-input-conversion"
import { rollEntityToLegacy } from "@/src/infrastructure/services/roll-entity-to-legacy"
import { TOKENS } from "@/di/tokens"

export interface ReceivePurchaseOrderInput {
  purchaseOrderId: string
  items: POReceiptItem[]
  actor: ActionActor
}

export interface IReceivePurchaseOrderUseCase {
  execute(input: ReceivePurchaseOrderInput): Promise<POReceiptResult>
}

/**
 * Cross-aggregate orchestrator for the PO-receive flow.
 *
 * Splits the legacy `legacyPurchaseOrderService.receivePurchaseOrder`
 * monolith along aggregate lines:
 *   1. PO aggregate — receipt deltas applied via the entity's
 *      `recordReceipt(lineNumber, …)`; status auto-flips on full receipt.
 *      Persisted through `IPurchaseOrderService.recordReceiptsByItemId`,
 *      which also returns the `previousStatus` (needed for the
 *      notification's `oldStatus`) and the `itemId → lineNumber` map.
 *   2. Roll aggregate — for each receipt item that ships with
 *      `rollData`, build entity-typed `CreateRollProps` (imperial →
 *      metric, branded IDs, Money cost) and persist via
 *      `IRollService.createRoll`.
 *   3. Notification — `sendPOStatusUpdate` on full receipt only;
 *      `previousStatus` distinguishes `ordered → received` from
 *      `partial_received → received`.
 *
 * **Strict-throw semantics (step 7a):** if a `createRoll` call fails
 * after the PO write succeeds, the use-case throws. The PO's receipt
 * update is already persisted, so this leaves a partial-state window
 * matching the pre-DDD legacy behavior. Step 7b adds the idempotency
 * key + `po_receipts_pending_roll_creation` reconciliation view + a
 * best-effort retry path to close the window.
 */
@injectable()
export class ReceivePurchaseOrderUseCase implements IReceivePurchaseOrderUseCase {
  constructor(
    @inject(TOKENS.IPurchaseOrderService)
    private readonly poService: IPurchaseOrderService,
    @inject(TOKENS.IRollService) private readonly rollService: IRollService,
    @inject(TOKENS.ISupplierService) private readonly supplierService: ISupplierService,
    @inject(TOKENS.INotificationService)
    private readonly notificationService: INotificationService
  ) {}

  async execute(input: ReceivePurchaseOrderInput): Promise<POReceiptResult> {
    const actorId = ProfileId.fromPersistence(input.actor.id)
    const receivedAt = new Date()

    const sqmReceipts: ReceiptDeltaByItemId[] = input.items.map((item) => ({
      itemId: item.itemId,
      quantityReceivedSqm: sqftToSqm(item.quantityReceived),
      receivedDate: receivedAt,
    }))

    const { previousStatus, purchaseOrder, itemIdToLineNumber } =
      await this.poService.recordReceiptsByItemId(input.purchaseOrderId, sqmReceipts, actorId)

    const rollsCreated: LegacyRoll[] = []
    for (const item of input.items) {
      if (!item.rollData || item.quantityReceived <= 0) continue

      const lineNumber = itemIdToLineNumber.get(item.itemId)
      if (lineNumber === undefined) continue
      const poItem = purchaseOrder.items.find((i) => i.lineNumber === lineNumber)
      if (!poItem) continue

      const props = buildCreateRollProps({
        id: RollId.fromPersistence(randomUUID()),
        tenantId: purchaseOrder.tenantId,
        supplierId: purchaseOrder.supplierId,
        poItem,
        rollData: item.rollData,
        quantityReceivedSqft: item.quantityReceived,
        actor: actorId,
        poNumber: purchaseOrder.poNumber,
      })

      const roll = await this.rollService.createRoll(props)
      rollsCreated.push(rollEntityToLegacy(roll))
    }

    const partial = purchaseOrder.status === "partial_received"
    if (!partial) {
      try {
        const supplier = await this.supplierService.getSupplierById(purchaseOrder.supplierId.value)
        await this.notificationService.sendPOStatusUpdate({
          actorId: input.actor.id,
          userIdentifier: input.actor.id,
          poNumber: purchaseOrder.poNumber,
          supplier: supplier.name,
          oldStatus: previousStatus,
          newStatus: purchaseOrder.status,
        })
      } catch (error) {
        console.error("Failed to send PO received notification:", error)
      }
    }

    return {
      purchaseOrderId: purchaseOrder.id.value,
      itemsReceived: input.items.length,
      rollsCreated,
      partialReceipt: partial,
      completedAt: purchaseOrder.actualDeliveryDate?.toISOString(),
    }
  }
}
