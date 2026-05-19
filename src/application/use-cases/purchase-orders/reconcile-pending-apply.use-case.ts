import "reflect-metadata"
import { injectable, inject } from "tsyringe"

import type { ActionActor } from "@/src/application/types/action-actor"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { PurchaseOrder } from "@/src/entities/purchase-order"
import { ProfileId } from "@/src/entities/value-objects/id"
import { TOKENS } from "@/di/tokens"

export interface ReconcilePendingApplyInput {
  receiptId: string
  actor: ActionActor
}

export interface ReconcilePendingApplyResult {
  /** Updated PO aggregate (or current state if the row was already applied). */
  purchaseOrder: PurchaseOrder
  /**
   * True when the use-case actually re-applied the receipt on this call;
   * false when the receipt's `applied_at` was already populated and the
   * use-case short-circuited as a no-op. Callers can surface the
   * distinction in the admin toast.
   */
  alreadyApplied: boolean
}

export interface IReconcilePendingApplyUseCase {
  execute(input: ReconcilePendingApplyInput): Promise<ReconcilePendingApplyResult>
}

/**
 * Admin reconcile-path for the "PO update was lost after the receipt INSERT
 * succeeded" race window (step 7c-1's `po_receipts_pending_apply` view).
 *
 * The receive-PO use-case persists a `po_item_receipts` row BEFORE mutating
 * the PO aggregate so a retry with the same idempotency key dedups via the
 * UNIQUE constraint. If the subsequent `repo.update(po)` fails (or the
 * `markReceiptApplied` stamp never lands), the receipt row exists but
 * `purchase_order_items.quantity_received_sqm` was never incremented. Same-key
 * retries from the operator hit the ON CONFLICT and skip the entity apply
 * AGAIN — the PO is permanently under-received until an admin reconciles.
 *
 * This use-case is the reconcile path: load the orphaned receipt, call
 * `po.recordReceipt(...)` on the PO aggregate with the receipt's stored
 * values, persist, stamp `applied_at`. Idempotent at the use-case level —
 * if `applied_at` is already populated when the admin clicks Retry, the
 * use-case returns the current PO without re-running the entity mutator.
 *
 * Entity-level guards still apply: if the PO has since transitioned out of
 * `ordered` or `partial_received` (e.g., the operator cancelled it), the
 * entity throws `InvalidEntityError` and the admin sees a clear error. The
 * receipt row remains in the pending view in that case — admin investigation
 * required.
 */
@injectable()
export class ReconcilePendingApplyUseCase implements IReconcilePendingApplyUseCase {
  constructor(
    @inject(TOKENS.IPurchaseOrderService)
    private readonly poService: IPurchaseOrderService
  ) {}

  async execute(input: ReconcilePendingApplyInput): Promise<ReconcilePendingApplyResult> {
    const actorId = ProfileId.fromPersistence(input.actor.id)
    const receipt = await this.poService.findReceiptById(input.receiptId)

    // Idempotency: receipt already stamped means the apply landed on a
    // prior call. Load the current PO so the admin UI can refresh and
    // return — no entity mutation, no double-stamp.
    if (receipt.appliedAt !== null) {
      const purchaseOrder = await this.poService.getById(receipt.purchaseOrderId)
      return { purchaseOrder, alreadyApplied: true }
    }

    // Reuses the entity-typed `recordReceipts` service path: loads the PO,
    // calls `po.recordReceipt(lineNumber, ...)`, persists. Cannot route
    // through `recordReceiptsByItemId` (the idempotent variant) because
    // that would re-INSERT the receipt row and conflict on its existing
    // `(item_id, idempotency_key)` UNIQUE.
    //
    // Entity-level guards still apply: if the PO is no longer in
    // {ordered, partial_received}, `recordReceipts` throws
    // `InvalidEntityError` and propagates to the action's toast.
    const updatedPo = await this.poService.recordReceipts(
      receipt.purchaseOrderId,
      [
        {
          lineNumber: receipt.lineNumber,
          quantityReceivedSqm: receipt.quantityReceivedSqm,
          receivedDate: receipt.receivedDate,
        },
      ],
      actorId
    )
    await this.poService.markReceiptApplied(receipt.receiptId)
    return { purchaseOrder: updatedPo, alreadyApplied: false }
  }
}
