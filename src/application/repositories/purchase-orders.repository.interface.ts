import type { PurchaseOrder } from "@/src/entities/purchase-order"
import type { PoStatus } from "@/src/entities/value-objects/po-status"

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
   * Persists state-transition mutations. The PO header row is UPDATEd;
   * item rows are synced — existing rows get UPDATE, new lines get
   * INSERT, lines no longer present in the aggregate get soft-deleted.
   * The caller has already invoked the entity mutator and is the source
   * of truth for the new state.
   */
  update(po: PurchaseOrder): Promise<PurchaseOrder>
}
