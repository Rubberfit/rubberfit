import type { Roll } from "@/src/infrastructure/models/supabase"

/**
 * Per-item input row to `ReceivePurchaseOrderUseCase`. Matches the
 * action layer's Zod-parsed receive form payload — legacy
 * column-name conventions because the form still ships imperial
 * units (the use-case converts at the boundary via
 * `po-input-conversion.ts`).
 */
export interface POReceiptItem {
  itemId: string
  quantityReceived: number
  rollData?: Partial<Roll>
}

/**
 * Return shape for `ReceivePurchaseOrderUseCase`. Caller-side
 * contract (server action returns this; UI consumes it).
 *
 * `failedItemIds` carries items whose PO-receipt write succeeded
 * but whose downstream roll-creation call failed (best-effort
 * semantics). Empty on the happy path; populated entries are also
 * surfaced by the `po_receipts_pending_roll_creation` reconciliation
 * view so admins can backfill missing inventory without replaying
 * the receive flow.
 */
export interface POReceiptResult {
  purchaseOrderId: string
  itemsReceived: number
  rollsCreated: Roll[]
  partialReceipt: boolean
  completedAt?: string
  failedItemIds: string[]
}
