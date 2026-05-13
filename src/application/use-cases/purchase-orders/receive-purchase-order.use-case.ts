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
import { ProfileId, PurchaseOrderItemId, RollId } from "@/src/entities/value-objects/id"
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
 *      metric, branded IDs, Money cost, `purchaseOrderItemId` set)
 *      and persist via `IRollService.createRoll`.
 *   3. Notification — `sendPOStatusUpdate` on full receipt only;
 *      `previousStatus` distinguishes `ordered → received` from
 *      `partial_received → received`. Sent even when some roll inserts
 *      failed, because the PO aggregate's state ("received") is real.
 *
 * **Best-effort semantics (step 7b):** if a `createRoll` call fails
 * after the PO write succeeds, the use-case catches the error, logs
 * it with the failing `itemId`, and continues the loop. The failing
 * itemIds are returned in `POReceiptResult.failedItemIds` so the
 * caller can surface them in the UI. They are also queryable via the
 * `po_receipts_pending_roll_creation` view (it joins on the
 * `rolls.purchase_order_item_id` FK set by `buildCreateRollProps`),
 * giving admins a stable reconciliation surface that doesn't depend
 * on the original request's error log.
 *
 * Step 7c will add an admin retry action backed by the reconciliation
 * view, plus per-receipt idempotency keys for safe operator retries.
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
    const failedItemIds: string[] = []
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
        purchaseOrderItemId: PurchaseOrderItemId.fromPersistence(item.itemId),
        rollData: item.rollData,
        quantityReceivedSqft: item.quantityReceived,
        actor: actorId,
        poNumber: purchaseOrder.poNumber,
      })

      try {
        const roll = await this.rollService.createRoll(props)
        rollsCreated.push(rollEntityToLegacy(roll))
      } catch (error) {
        // Best-effort: PO receipt is already persisted. Continue the
        // loop so other items still get their rolls; surface failed
        // ids to the caller + the reconciliation view as the safety
        // net. Don't rethrow.
        failedItemIds.push(item.itemId)
        console.error(
          `[receive-po] roll creation failed for PO ${purchaseOrder.poNumber} item ${item.itemId}:`,
          error
        )
      }
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
      failedItemIds,
    }
  }
}
