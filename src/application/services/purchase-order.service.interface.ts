import type {
  CreatePurchaseOrderProps,
  PurchaseOrder,
  PurchaseOrderUpdateProps,
} from "@/src/entities/purchase-order"
import type { CreatePurchaseOrderItemProps } from "@/src/entities/purchase-order-item"
import type { ProfileId } from "@/src/entities/value-objects/id"
import type { PoStatus } from "@/src/entities/value-objects/po-status"

/**
 * Per-line receipt delta as it crosses the service boundary. Maps a
 * line by its (1-based) `lineNumber` to a "received this batch" delta
 * in sqm. The entity's `recordReceipt(lineNumber, deltaSqm, …)` does
 * the actual mutation + status auto-flip.
 */
export interface ReceiptDelta {
  lineNumber: number
  quantityReceivedSqm: number
  receivedDate?: Date
}

/**
 * Per-line receipt delta keyed by the PO item's persistence row id
 * rather than `lineNumber`. The action layer's contract uses row IDs
 * (the form sends `itemId` from a hydrated PO row), but the entity
 * identity is `(poId, lineNumber)`. The service translates internally.
 */
export interface ReceiptDeltaByItemId {
  itemId: string
  quantityReceivedSqm: number
  receivedDate?: Date
}

/**
 * Return shape for `recordReceiptsByItemId`. The use-case body needs
 * all three values to correctly orchestrate cross-aggregate side effects:
 *   • `previousStatus` powers the notification's `oldStatus` so a
 *     `partial_received → received` transition reads correctly (the
 *     entity has already mutated by the time this returns).
 *   • `purchaseOrder` is the updated aggregate.
 *   • `itemIdToLineNumber` lets the caller correlate `rollData` inputs
 *     (action-shape, keyed by row id) back to entity items (keyed by
 *     `lineNumber`).
 */
export interface RecordReceiptsByItemIdResult {
  previousStatus: PoStatus
  purchaseOrder: PurchaseOrder
  itemIdToLineNumber: Map<string, number>
}

/**
 * Narrow entity-typed orchestrator over `IPurchaseOrdersRepository` +
 * `PurchaseOrder` aggregate transitions. Item-collection mutations and
 * money invariants live in the entity; this service only wires actor
 * identity, loads the aggregate, calls the entity method, and persists.
 *
 * Wide raw-row CRUD + the 22-method pre-DDD surface stay on
 * `ILegacyPurchaseOrderService` until each consumer migrates onto this
 * one.
 */
export interface IPurchaseOrderService {
  // ─── Reads ──────────────────────────────────────────────────────────────

  getById(id: string): Promise<PurchaseOrder>
  getActive(): Promise<PurchaseOrder[]>
  getByStatuses(statuses: PoStatus[]): Promise<PurchaseOrder[]>

  // ─── Writes ─────────────────────────────────────────────────────────────

  /**
   * Constructs a `PurchaseOrder` via `PurchaseOrder.create` and
   * persists it (header + items). Returns the rehydrated aggregate.
   */
  createPO(props: CreatePurchaseOrderProps): Promise<PurchaseOrder>

  /**
   * Bulk edit of header-level details: supplier, addresses, job,
   * po_number, requested delivery, tax + shipping, payment terms,
   * notes. Allowed only in `draft` / `pending_approval`. Recomputes
   * `totalAmount` invariant if tax or shipping changed.
   */
  updateDetails(
    id: string,
    props: PurchaseOrderUpdateProps,
    actor: ProfileId
  ): Promise<PurchaseOrder>

  /**
   * Header + items in one round-trip. Internal: load the aggregate
   * once, call `updateDetails` then `replaceItems` on the same
   * instance, persist once. Use over two sequential service calls to
   * avoid the partial-state window when the second call fails.
   *
   * Like `updateDetails` + `replaceItems`, only allowed in
   * `draft` / `pending_approval` — the entity enforces it.
   */
  updateDetailsAndItems(
    id: string,
    headerProps: PurchaseOrderUpdateProps,
    items: CreatePurchaseOrderItemProps[],
    actor: ProfileId
  ): Promise<PurchaseOrder>

  /**
   * Header-immutable bulk replace of the item collection. Recomputes
   * subtotal + total. Only allowed in `draft` / `pending_approval`.
   */
  replaceItems(
    id: string,
    items: CreatePurchaseOrderItemProps[],
    actor: ProfileId
  ): Promise<PurchaseOrder>

  submitForApproval(id: string, actor: ProfileId): Promise<PurchaseOrder>
  approve(id: string, actor: ProfileId): Promise<PurchaseOrder>

  /**
   * Rejects a `pending_approval` PO back to `draft` for edits. The
   * entity doesn't carry a "rejection reason" field; capturing the
   * reason for audit/notification is the use-case's responsibility
   * (it lives on the queued notification, not on the PO row).
   */
  rejectToDraft(id: string, actor: ProfileId): Promise<PurchaseOrder>

  /**
   * Flips `approved → ordered` and stamps the supplied `orderDate`. The
   * entity re-validates `requestedDeliveryDate >= orderDate`.
   */
  markOrdered(id: string, orderDate: Date, actor: ProfileId): Promise<PurchaseOrder>

  cancel(id: string, actor: ProfileId): Promise<PurchaseOrder>

  /**
   * Records per-line receipt deltas in one shot. The aggregate
   * validates each line, accumulates received quantity, and
   * auto-flips status to `partial_received` or `received` based on
   * aggregate fill. Stamps `actualDeliveryDate` on full receipt.
   *
   * Cross-aggregate side effects (roll creation, notification fan-out)
   * are the caller's responsibility — invoke them AFTER the PO is
   * persisted to avoid orphan inventory if the PO write fails.
   */
  recordReceipts(id: string, receipts: ReceiptDelta[], actor: ProfileId): Promise<PurchaseOrder>

  /**
   * `recordReceipts` variant accepting itemId-keyed receipts. Resolves
   * the `itemId → lineNumber` map via the repository, captures the
   * `previousStatus` before mutating, then runs the same entity
   * `recordReceipt` path as the line-number-keyed variant.
   *
   * Returns the previous status + updated aggregate + the resolved
   * id-to-line-number map (the caller's cross-aggregate orchestration
   * needs the map to correlate ancillary inputs like roll-creation
   * payloads back to entity items).
   *
   * Cross-aggregate side effects (roll creation, notification fan-out)
   * are still the caller's responsibility — invoke them AFTER this
   * returns, against the persisted state.
   */
  recordReceiptsByItemId(
    id: string,
    receipts: ReceiptDeltaByItemId[],
    actor: ProfileId
  ): Promise<RecordReceiptsByItemIdResult>

  /** Admin-only soft delete. */
  softDelete(id: string, actor: ProfileId): Promise<PurchaseOrder>
}
