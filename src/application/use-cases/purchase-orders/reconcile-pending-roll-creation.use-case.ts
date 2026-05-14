import "reflect-metadata"
import { randomUUID } from "node:crypto"
import { injectable, inject } from "tsyringe"

import type { ActionActor } from "@/src/application/types/action-actor"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { IRollService } from "@/src/application/services/roll.service.interface"
import type { Roll } from "@/src/entities/roll"
import { ProfileId, RollId } from "@/src/entities/value-objects/id"
import { buildCreateRollPropsFromReceipt } from "@/src/application/use-cases/purchase-orders/po-input-conversion"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { TOKENS } from "@/di/tokens"

export interface ReconcilePendingRollCreationInput {
  receiptId: string
  actor: ActionActor
}

export type ReconcilePendingRollCreationOutcome =
  | { kind: "created"; roll: Roll }
  | { kind: "already-exists"; roll: Roll }
  | { kind: "already-stamped"; roll: Roll }

export interface IReconcilePendingRollCreationUseCase {
  execute(input: ReconcilePendingRollCreationInput): Promise<ReconcilePendingRollCreationOutcome>
}

/**
 * Admin reconcile-path for the "rollService.createRoll failed (or its
 * stamp never persisted) after the PO apply succeeded" race window
 * (step 7c-1's `po_receipts_pending_roll_creation` view).
 *
 * The receive-PO use-case calls `markReceiptRollCreated(receiptId)` only
 * AFTER `rollService.createRoll` succeeds. If createRoll throws (or its
 * subsequent stamp lands but never persists), the receipt sits in the
 * pending-roll view until reconciled.
 *
 * Three states this use-case handles:
 *
 *   1. `already-stamped`: `roll_created_at IS NOT NULL`. The view's
 *      WHERE clause already filters these out, but the use-case
 *      double-checks (admin might have a stale page open). Loads the
 *      existing roll via `purchaseOrderItemId` lookup and returns —
 *      no new work.
 *
 *   2. `already-exists`: receipt stamp is NULL but a matching roll
 *      exists. This is the rare "createRoll succeeded but the stamp
 *      lost" partial-success window. Stamp the receipt to sync state,
 *      return the existing roll — no duplicate insert.
 *
 *   3. `created`: receipt stamp is NULL AND no matching roll exists.
 *      Replay `buildCreateRollPropsFromReceipt`, call
 *      `rollService.createRoll`, stamp `roll_created_at`. The new
 *      roll's FK back to the PO item lets the reconciliation view's
 *      NOT EXISTS clause stop surfacing this receipt.
 *
 * Race window between case-3's "no roll exists" check and `createRoll`:
 * if two admins click Retry concurrently, both could pass the check
 * and both could insert rolls. Accepted — probability is low and
 * recovery is manual roll deletion. A UNIQUE constraint on
 * `rolls(purchase_order_item_id)` would block legitimate partial-shipment
 * cases where one item gets multiple rolls.
 */
@injectable()
export class ReconcilePendingRollCreationUseCase implements IReconcilePendingRollCreationUseCase {
  constructor(
    @inject(TOKENS.IPurchaseOrderService)
    private readonly poService: IPurchaseOrderService,
    @inject(TOKENS.IRollService)
    private readonly rollService: IRollService
  ) {}

  async execute(
    input: ReconcilePendingRollCreationInput
  ): Promise<ReconcilePendingRollCreationOutcome> {
    const actorId = ProfileId.fromPersistence(input.actor.id)
    const receipt = await this.poService.findReceiptById(input.receiptId)

    if (!receipt.rollRequested) {
      throw new InvalidEntityError(
        "PoItemReceipt",
        `receipt ${receipt.receiptId} has roll_requested = false; no roll to reconcile`
      )
    }
    if (receipt.appliedAt === null) {
      // Roll-creation must happen AFTER the apply lands. If applied_at is
      // NULL, the receipt belongs in po_receipts_pending_apply, not here —
      // admin should run reconcile-pending-apply first.
      throw new InvalidEntityError(
        "PoItemReceipt",
        `receipt ${receipt.receiptId} is not applied yet; reconcile the apply first`
      )
    }

    // Case 1: stamp already populated. Find the existing roll for context
    // and return — the view shouldn't have surfaced this row, but the
    // admin's page may be stale.
    if (receipt.rollCreatedAt !== null) {
      const existing = await this.rollService.findByPurchaseOrderItemId(receipt.purchaseOrderItemId)
      if (!existing) {
        // Stamp populated but no matching roll — the roll was soft-deleted
        // out from under us. The view's NOT EXISTS guard would surface
        // this row again only if we cleared the stamp; for now, treat as
        // already-stamped and let the admin investigate manually.
        throw new InvalidEntityError(
          "PoItemReceipt",
          `receipt ${receipt.receiptId} has roll_created_at set but no matching non-deleted roll exists`
        )
      }
      return { kind: "already-stamped", roll: existing }
    }

    // Case 2: stale-stamp recovery. Roll exists but receipt wasn't stamped.
    // Stamp now to sync state; return the existing roll.
    const existingRoll = await this.rollService.findByPurchaseOrderItemId(
      receipt.purchaseOrderItemId
    )
    if (existingRoll !== null) {
      await this.poService.markReceiptRollCreated(receipt.receiptId)
      return { kind: "already-exists", roll: existingRoll }
    }

    // Case 3: replay createRoll using the receipt's typed roll-intent
    // snapshot + PO-item fallbacks.
    const po = await this.poService.getById(receipt.purchaseOrderId)
    const poItem = po.items.find((item) => item.lineNumber === receipt.lineNumber)
    if (!poItem) {
      throw new InvalidEntityError(
        "PurchaseOrder",
        `no item with lineNumber ${receipt.lineNumber} on PO ${receipt.purchaseOrderId}`
      )
    }

    const props = buildCreateRollPropsFromReceipt({
      id: RollId.fromPersistence(randomUUID()),
      receipt,
      poItem,
      tenantId: po.tenantId,
      supplierId: po.supplierId,
      actor: actorId,
    })
    const roll = await this.rollService.createRoll(props)

    // Stamp on success. Stamp failure is non-fatal: the view's NOT EXISTS
    // guard against `rolls` excludes rows where a roll exists, so a stale
    // stamp won't keep this receipt visible. Logged for the operator log
    // but not rethrown.
    try {
      await this.poService.markReceiptRollCreated(receipt.receiptId)
    } catch (stampError) {
      console.error(
        `[reconcile-roll] stamp failed for receipt ${receipt.receiptId} (roll ${roll.id.value}):`,
        stampError
      )
    }

    return { kind: "created", roll }
  }
}
