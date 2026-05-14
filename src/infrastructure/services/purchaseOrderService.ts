import "reflect-metadata"
import { injectable, inject } from "tsyringe"

import {
  PurchaseOrder,
  type CreatePurchaseOrderProps,
  type PurchaseOrderUpdateProps,
} from "@/src/entities/purchase-order"
import type { CreatePurchaseOrderItemProps } from "@/src/entities/purchase-order-item"
import type { ProfileId } from "@/src/entities/value-objects/id"
import type { PoStatus } from "@/src/entities/value-objects/po-status"
import type { IPurchaseOrdersRepository } from "@/src/application/repositories/purchase-orders.repository.interface"
import type {
  IPurchaseOrderService,
  ReceiptDelta,
  ReceiptDeltaByItemId,
  RecordReceiptsByItemIdResult,
} from "@/src/application/services/purchase-order.service.interface"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { TOKENS } from "@/di/tokens"

/**
 * Entity-typed orchestrator over `IPurchaseOrdersRepository`. Each
 * mutator follows the load → entity-mutate → repo.update pattern.
 * State-machine discipline (transition guards, money invariant,
 * receipt validation, auto-status-flip) lives in the `PurchaseOrder`
 * aggregate root.
 *
 * Cross-aggregate side effects (roll creation on receipt, notification
 * fan-out, tax recompute) are NOT this service's job — callers (the
 * 5 PO use-cases) own them. The service only persists the aggregate
 * state.
 */
@injectable()
export class PurchaseOrderService implements IPurchaseOrderService {
  constructor(
    @inject(TOKENS.IPurchaseOrdersRepository)
    private readonly repo: IPurchaseOrdersRepository
  ) {}

  // ─── Reads ──────────────────────────────────────────────────────────────

  getById(id: string): Promise<PurchaseOrder> {
    return this.repo.findById(id)
  }

  getActive(): Promise<PurchaseOrder[]> {
    return this.repo.findActive()
  }

  getByStatuses(statuses: PoStatus[]): Promise<PurchaseOrder[]> {
    return this.repo.findByStatuses(statuses)
  }

  // ─── Writes ─────────────────────────────────────────────────────────────

  createPO(props: CreatePurchaseOrderProps): Promise<PurchaseOrder> {
    const po = PurchaseOrder.create(props)
    return this.repo.insert(po)
  }

  async updateDetails(
    id: string,
    props: PurchaseOrderUpdateProps,
    actor: ProfileId
  ): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.updateDetails(props, actor)
    return this.repo.update(po)
  }

  async updateDetailsAndItems(
    id: string,
    headerProps: PurchaseOrderUpdateProps,
    items: CreatePurchaseOrderItemProps[],
    actor: ProfileId
  ): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.updateDetails(headerProps, actor)
    po.replaceItems(items, actor)
    return this.repo.update(po)
  }

  async replaceItems(
    id: string,
    items: CreatePurchaseOrderItemProps[],
    actor: ProfileId
  ): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.replaceItems(items, actor)
    return this.repo.update(po)
  }

  async submitForApproval(id: string, actor: ProfileId): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.submitForApproval(actor)
    return this.repo.update(po)
  }

  async approve(id: string, actor: ProfileId): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.approve(actor)
    return this.repo.update(po)
  }

  async rejectToDraft(id: string, actor: ProfileId): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.rejectToDraft(actor)
    return this.repo.update(po)
  }

  async markOrdered(id: string, orderDate: Date, actor: ProfileId): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.markOrdered(orderDate, actor)
    return this.repo.update(po)
  }

  async cancel(id: string, actor: ProfileId): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.cancel(actor)
    return this.repo.update(po)
  }

  async recordReceipts(
    id: string,
    receipts: ReceiptDelta[],
    actor: ProfileId
  ): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    const now = new Date()
    for (const receipt of receipts) {
      po.recordReceipt(
        receipt.lineNumber,
        receipt.quantityReceivedSqm,
        receipt.receivedDate ?? now,
        actor,
        now
      )
    }
    return this.repo.update(po)
  }

  async recordReceiptsByItemId(
    id: string,
    receipts: ReceiptDeltaByItemId[],
    actor: ProfileId
  ): Promise<RecordReceiptsByItemIdResult> {
    const [po, itemIdToLineNumber] = await Promise.all([
      this.repo.findById(id),
      this.repo.itemIdToLineNumberMap(id),
    ])
    const previousStatus = po.status
    const now = new Date()
    const tenantId = po.tenantId.value
    const actorId = actor.value

    // Step 1: Idempotent receipt INSERT FIRST. The UNIQUE
    // (purchase_order_item_id, idempotency_key) constraint dedupes
    // retries before the entity is mutated. Build the apply-set as we go.
    const receiptIdByItemId = new Map<string, string>()
    const alreadyAppliedItemIds: string[] = []
    const toApply: { receipt: ReceiptDeltaByItemId; lineNumber: number; receiptId: string }[] = []

    for (const receipt of receipts) {
      const lineNumber = itemIdToLineNumber.get(receipt.itemId)
      if (lineNumber === undefined) {
        throw new InvalidEntityError(
          "PurchaseOrder",
          `no item with id '${receipt.itemId}' on PO ${id}`
        )
      }

      const inserted = await this.repo.insertReceiptIdempotent({
        tenantId,
        purchaseOrderItemId: receipt.itemId,
        idempotencyKey: receipt.idempotencyKey,
        quantityReceivedSqm: receipt.quantityReceivedSqm,
        receivedDate: receipt.receivedDate ?? now,
        rollRequested: receipt.rollRequested,
        rollIntent: receipt.rollIntent,
        createdBy: actorId,
      })

      receiptIdByItemId.set(receipt.itemId, inserted.receiptId)

      if (!inserted.wasInserted) {
        // Same key on this item already exists → skip the entity apply.
        // The use-case will also skip the roll creation for this item.
        alreadyAppliedItemIds.push(receipt.itemId)
        continue
      }

      toApply.push({ receipt, lineNumber, receiptId: inserted.receiptId })
    }

    // Step 2: Apply the fresh receipts to the entity.
    for (const { receipt, lineNumber } of toApply) {
      po.recordReceipt(
        lineNumber,
        receipt.quantityReceivedSqm,
        receipt.receivedDate ?? now,
        actor,
        now
      )
    }

    // Step 3: Persist the PO aggregate. If this throws, the freshly
    // inserted receipt rows are left with `applied_at IS NULL` and
    // surface in `po_receipts_pending_apply` for admin reconciliation.
    const purchaseOrder = await this.repo.update(po)

    // Step 4: Stamp `applied_at` on every freshly inserted receipt
    // AFTER the PO persistence succeeded. Sequential not parallel —
    // the stamps are independent but cheap, and parallel would just
    // burst the DB without atomicity benefit.
    for (const { receiptId } of toApply) {
      await this.repo.markReceiptApplied(receiptId)
    }

    return {
      previousStatus,
      purchaseOrder,
      itemIdToLineNumber,
      alreadyAppliedItemIds,
      receiptIdByItemId,
    }
  }

  markReceiptRollCreated(receiptId: string): Promise<void> {
    return this.repo.markReceiptRollCreated(receiptId)
  }

  async softDelete(id: string, actor: ProfileId): Promise<PurchaseOrder> {
    const po = await this.repo.findById(id)
    po.softDelete(actor)
    return this.repo.update(po)
  }
}
