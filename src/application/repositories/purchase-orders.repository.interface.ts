import type { PurchaseOrder } from "@/src/entities/purchase-order"
import type { PoStatus } from "@/src/entities/value-objects/po-status"

/**
 * One row in `po_item_receipts` as the repo persists it. The service /
 * use-case layer builds this from action input + entity context; the
 * repo translates it into INSERT columns. Quantities are in metric
 * (sqm / mm / cents), matching the schema.
 */
export interface InsertReceiptInput {
  tenantId: string
  purchaseOrderItemId: string
  idempotencyKey: string
  quantityReceivedSqm: number
  receivedDate: Date
  rollRequested: boolean
  rollIntent?: {
    widthMm?: number | null
    lengthMm?: number | null
    thicknessMm?: number | null
    color?: string | null
    location?: string | null
    costPerSqmCents?: number | null
    notes?: string | null
  }
  createdBy: string
}

/**
 * Result of `insertReceiptIdempotent`. `wasInserted = false` means the
 * INSERT collided on `(purchase_order_item_id, idempotency_key)` UNIQUE
 * and the existing row's id is returned instead — callers SKIP the
 * entity-apply + roll-creation path on that signal.
 */
export interface InsertReceiptResult {
  receiptId: string
  wasInserted: boolean
}

export interface PoReceiptReconciliationRow {
  receiptId: string
  tenantId: string
  purchaseOrderItemId: string
  idempotencyKey: string
  quantityReceivedSqm: number
  receivedDate: Date
  receiptCreatedAt: Date
  receiptCreatedBy: string | null
  purchaseOrderId: string
  lineNumber: number
  materialTypeId: string
  poNumber: string
  supplierId: string
  purchaseOrderStatus: PoStatus
  rollWidthMm: number | null
  rollLengthMm: number | null
  rollThicknessMm: number | null
  rollColor: string | null
  rollLocation: string | null
  rollCostPerSqmCents: number | null
  rollNotes: string | null
}

export interface PoItemReceiptWithContext extends PoReceiptReconciliationRow {
  rollRequested: boolean
  appliedAt: Date | null
  rollCreatedAt: Date | null
}

/**
 * Purchase-orders persistence boundary. Narrow entity-typed surface —
 * the legacy raw-row CRUD that the existing UI / RF api-client still
 * needs lives on `ILegacyPurchaseOrderService`.
 *
 * Reads always include the full, non-deleted `purchase_order_items`
 * children (sorted by `line_number`) so the returned aggregate is whole.
 * Writes flow through the aggregate root — `repo.update(po)` syncs
 * child rows by `(purchase_order_id, line_number)`, avoiding the
 * delete-and-reinsert churn that would invalidate row IDs on every
 * status-only update.
 */
export interface IPurchaseOrdersRepository {
  /** Returns the entity for `id` with items rehydrated, or throws if not found. */
  findById(id: string): Promise<PurchaseOrder>

  /** Non-deleted POs, newest first, with items. */
  findActive(): Promise<PurchaseOrder[]>

  /**
   * POs filtered by status (one or more values). Newest first. Used by
   * the create-bulk-reorder use-case to enumerate pending POs when
   * computing pending-PO-aware reorder suggestions.
   */
  findByStatuses(statuses: PoStatus[]): Promise<PurchaseOrder[]>

  /** Inserts a freshly-built PO + all its items in one logical write. */
  insert(po: PurchaseOrder): Promise<PurchaseOrder>

  /**
   * Resolves a `Map<itemId, lineNumber>` for the non-deleted items of
   * the given PO. The entity surface for `PurchaseOrderItem` deliberately
   * doesn't expose the row id (identity is `(poId, lineNumber)`), so the
   * receive use-case — whose action input is `itemId`-keyed — needs this
   * boundary helper to correlate input rows back to entity items.
   * The mapper/SQL layer sees the row id; the entity doesn't.
   */
  itemIdToLineNumberMap(poId: string): Promise<Map<string, number>>

  /**
   * Loads a receipt row plus the PO/item context needed for admin
   * reconciliation. The use-case gets one coherent snapshot instead of
   * knowing how receipt rows join through `purchase_order_items`.
   */
  findReceiptById(receiptId: string): Promise<PoItemReceiptWithContext>

  /**
   * Rows from `po_receipts_pending_apply`: receipt rows whose insert
   * committed but whose PO aggregate apply/stamp did not.
   */
  findPendingApplyReceipts(): Promise<PoReceiptReconciliationRow[]>

  /**
   * Rows from `po_receipts_pending_roll_creation`: applied receipt rows
   * where an operator requested a roll and no non-deleted roll exists.
   */
  findPendingRollCreationReceipts(): Promise<PoReceiptReconciliationRow[]>

  /**
   * Persists state-transition mutations. The PO header row is UPDATEd;
   * item rows are synced — existing rows get UPDATE, new lines get
   * INSERT, lines no longer present in the aggregate get soft-deleted.
   * The caller has already invoked the entity mutator and is the source
   * of truth for the new state.
   */
  update(po: PurchaseOrder): Promise<PurchaseOrder>

  /**
   * Step 7c-1 idempotency anchor. Inserts a `po_item_receipts` row;
   * on `(purchase_order_item_id, idempotency_key)` UNIQUE conflict,
   * returns the existing row's id with `wasInserted = false` so the
   * service can short-circuit to "already applied" semantics.
   *
   * The receipt is recorded BEFORE the PO aggregate is mutated — the
   * UNIQUE constraint is what protects against double-applying a
   * delta on retry. Callers MUST handle `wasInserted = false` by
   * skipping the entity apply.
   */
  insertReceiptIdempotent(input: InsertReceiptInput): Promise<InsertReceiptResult>

  /**
   * Stamps `applied_at = now()` on the receipt row. The caller invokes
   * this AFTER `repo.update(po)` returns successfully — the stamp is
   * the signal that the PO aggregate state durably reflects this
   * receipt's delta. If a crash happens between the PO update and this
   * stamp, the row appears in `po_receipts_pending_apply` for admin
   * reconciliation.
   */
  markReceiptApplied(receiptId: string): Promise<void>

  /**
   * Stamps `roll_created_at = now()` on the receipt row. The caller
   * invokes this AFTER `rollService.createRoll` succeeds — the stamp
   * is the signal that the operator-requested roll persisted. If a
   * crash happens between createRoll and this stamp, the row appears
   * in `po_receipts_pending_roll_creation`, but the view's `NOT EXISTS`
   * guard against `rolls` excludes rows where a roll actually exists
   * (stale-stamp gracefully ignored).
   */
  markReceiptRollCreated(receiptId: string): Promise<void>
}
