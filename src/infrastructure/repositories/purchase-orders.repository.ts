import "reflect-metadata"
import { injectable } from "tsyringe"

import { PurchaseOrder } from "@/src/entities/purchase-order"
import { Currency } from "@/src/entities/value-objects/currency"
import type { PoStatus } from "@/src/entities/value-objects/po-status"
import type {
  IPurchaseOrdersRepository,
  InsertReceiptInput,
  InsertReceiptResult,
  PoItemReceiptWithContext,
  PoReceiptReconciliationRow,
} from "@/src/application/repositories/purchase-orders.repository.interface"
import {
  purchaseOrderItemToInsertRow,
  purchaseOrderItemToUpdateRow,
  purchaseOrderToInsertRow,
  purchaseOrderToUpdateRow,
  rowToPurchaseOrder,
  type PurchaseOrderItemRow,
  type PurchaseOrderRow,
} from "@/src/infrastructure/mappers/purchase-order.mapper"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

const PO_TABLE = "purchase_orders"
const ITEMS_TABLE = "purchase_order_items"
const RECEIPTS_TABLE = "po_item_receipts"
const PENDING_APPLY_VIEW = "po_receipts_pending_apply"
const PENDING_ROLL_VIEW = "po_receipts_pending_roll_creation"
const PO_COLUMNS = "*"
const ITEMS_COLUMNS = "*"

// Snake-case shapes returned from the two reconciliation views. The view
// definitions (migration 20260513000001) project these columns; pending_apply
// excludes the roll_* columns (no admin action ever needs them for that
// surface), pending_roll_creation includes them. Mapper sets roll_* to null
// when absent.
interface PendingApplyViewRow {
  receipt_id: string
  tenant_id: string
  purchase_order_item_id: string
  idempotency_key: string
  quantity_received_sqm: number
  received_date: string
  receipt_created_at: string
  receipt_created_by: string | null
  purchase_order_id: string
  line_number: number
  material_type_id: string
  po_number: string
  supplier_id: string
  purchase_order_status: PoStatus
}

interface PendingRollViewRow extends PendingApplyViewRow {
  roll_width_mm: number | null
  roll_length_mm: number | null
  roll_thickness_mm: number | null
  roll_color: string | null
  roll_location: string | null
  roll_cost_per_sqm_cents: number | null
  roll_notes: string | null
}

// The raw po_item_receipts row + JOIN'd po_id/line_number from
// purchase_order_items. Used by findReceiptById (reconcile use-cases need
// a full snapshot regardless of state, including already-stamped rows that
// aren't in either view anymore).
interface ReceiptWithJoinRow {
  id: string
  tenant_id: string
  purchase_order_item_id: string
  idempotency_key: string
  quantity_received_sqm: number
  received_date: string
  roll_requested: boolean
  roll_width_mm: number | null
  roll_length_mm: number | null
  roll_thickness_mm: number | null
  roll_color: string | null
  roll_location: string | null
  roll_cost_per_sqm_cents: number | null
  roll_notes: string | null
  applied_at: string | null
  roll_created_at: string | null
  created_at: string
  created_by: string | null
  purchase_order_items: {
    id: string
    line_number: number
    material_type_id: string
    purchase_order_id: string
    purchase_orders: {
      id: string
      po_number: string
      supplier_id: string
      status: PoStatus
    }
  }
}

function mapPendingApplyRow(row: PendingApplyViewRow): PoReceiptReconciliationRow {
  return {
    receiptId: row.receipt_id,
    tenantId: row.tenant_id,
    purchaseOrderItemId: row.purchase_order_item_id,
    idempotencyKey: row.idempotency_key,
    quantityReceivedSqm: Number(row.quantity_received_sqm),
    receivedDate: new Date(row.received_date),
    receiptCreatedAt: new Date(row.receipt_created_at),
    receiptCreatedBy: row.receipt_created_by,
    purchaseOrderId: row.purchase_order_id,
    lineNumber: row.line_number,
    materialTypeId: row.material_type_id,
    poNumber: row.po_number,
    supplierId: row.supplier_id,
    purchaseOrderStatus: row.purchase_order_status,
    // pending_apply view doesn't project roll_*; admin re-applies entity-only.
    rollWidthMm: null,
    rollLengthMm: null,
    rollThicknessMm: null,
    rollColor: null,
    rollLocation: null,
    rollCostPerSqmCents: null,
    rollNotes: null,
  }
}

function mapPendingRollRow(row: PendingRollViewRow): PoReceiptReconciliationRow {
  return {
    ...mapPendingApplyRow(row),
    rollWidthMm: row.roll_width_mm,
    rollLengthMm: row.roll_length_mm,
    rollThicknessMm: row.roll_thickness_mm,
    rollColor: row.roll_color,
    rollLocation: row.roll_location,
    rollCostPerSqmCents: row.roll_cost_per_sqm_cents,
    rollNotes: row.roll_notes,
  }
}

/**
 * Tenant-level currency resolution lands with the tenant-settings
 * migration. Until then, every PO is hydrated at USD — matches the
 * existing pre-DDD codebase, which already assumed USD throughout.
 */
const DEFAULT_CURRENCY = Currency.fromPersistence("USD")

@injectable()
export class PurchaseOrdersRepository implements IPurchaseOrdersRepository {
  async itemIdToLineNumberMap(poId: string): Promise<Map<string, number>> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(ITEMS_TABLE)
      .select("id, line_number")
      .eq("purchase_order_id", poId)
      .is("deleted_at", null)
    if (error) throw error

    const map = new Map<string, number>()
    for (const row of (data ?? []) as Array<{ id: string; line_number: number }>) {
      map.set(row.id, row.line_number)
    }
    return map
  }

  async findById(id: string): Promise<PurchaseOrder> {
    const client = await getDatabaseClient()
    const { data: header, error: headerError } = await client
      .from(PO_TABLE)
      .select(PO_COLUMNS)
      .eq("id", id)
      .single()
    if (headerError) throw headerError

    const { data: itemRows, error: itemsError } = await client
      .from(ITEMS_TABLE)
      .select(ITEMS_COLUMNS)
      .eq("purchase_order_id", id)
      .is("deleted_at", null)
      .order("line_number", { ascending: true })
    if (itemsError) throw itemsError

    return rowToPurchaseOrder(
      header as PurchaseOrderRow,
      (itemRows ?? []) as PurchaseOrderItemRow[],
      DEFAULT_CURRENCY
    )
  }

  async findActive(): Promise<PurchaseOrder[]> {
    return this.findManyByQuery((client) =>
      client
        .from(PO_TABLE)
        .select(PO_COLUMNS)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    )
  }

  async findByStatuses(statuses: PoStatus[]): Promise<PurchaseOrder[]> {
    if (statuses.length === 0) return []
    return this.findManyByQuery((client) =>
      client
        .from(PO_TABLE)
        .select(PO_COLUMNS)
        .is("deleted_at", null)
        .in("status", statuses)
        .order("created_at", { ascending: false })
    )
  }

  async insert(po: PurchaseOrder): Promise<PurchaseOrder> {
    const client = await getDatabaseClient()
    const { data: headerRow, error: headerError } = await client
      .from(PO_TABLE)
      .insert(purchaseOrderToInsertRow(po))
      .select(PO_COLUMNS)
      .single()
    if (headerError) throw headerError

    const poId = (headerRow as PurchaseOrderRow).id
    const tenantId = po.tenantId.value

    if (po.items.length > 0) {
      const itemPayloads = po.items.map((item) =>
        purchaseOrderItemToInsertRow(item, poId, tenantId)
      )
      const { error: itemsError } = await client.from(ITEMS_TABLE).insert(itemPayloads)
      if (itemsError) throw itemsError
    }

    return this.findById(poId)
  }

  /**
   * Persists header changes + syncs item collection by
   * `(purchase_order_id, line_number)`:
   *   - lines present in both: UPDATE (preserves row IDs)
   *   - lines new in aggregate: INSERT
   *   - lines dropped from aggregate: soft-delete (set `deleted_at`)
   *
   * Status-only mutations (`approve`, `reject`, `markAsOrdered`,
   * `cancel`) leave the items array identical, so the sync becomes a
   * no-op UPDATE on every existing row — repo-trip-light but
   * deliberately correct on the contract.
   */
  async update(po: PurchaseOrder): Promise<PurchaseOrder> {
    const client = await getDatabaseClient()
    const poId = po.id.value
    const tenantId = po.tenantId.value
    const updatedAt = po.updatedAt.toISOString()
    const updatedBy = po.updatedBy?.value ?? null

    const { error: headerError } = await client
      .from(PO_TABLE)
      .update(purchaseOrderToUpdateRow(po))
      .eq("id", poId)
    if (headerError) throw headerError

    const { data: existingRows, error: existingError } = await client
      .from(ITEMS_TABLE)
      .select("id, line_number")
      .eq("purchase_order_id", poId)
      .is("deleted_at", null)
    if (existingError) throw existingError

    const existingByLine = new Map<number, string>()
    for (const row of (existingRows ?? []) as Array<{ id: string; line_number: number }>) {
      existingByLine.set(row.line_number, row.id)
    }

    const newLineNumbers = new Set(po.items.map((item) => item.lineNumber))

    const toInsert = po.items.filter((item) => !existingByLine.has(item.lineNumber))
    const toUpdate = po.items.filter((item) => existingByLine.has(item.lineNumber))
    const toSoftDelete = [...existingByLine.entries()]
      .filter(([lineNumber]) => !newLineNumbers.has(lineNumber))
      .map(([, id]) => id)

    if (toInsert.length > 0) {
      const payloads = toInsert.map((item) => purchaseOrderItemToInsertRow(item, poId, tenantId))
      const { error } = await client.from(ITEMS_TABLE).insert(payloads)
      if (error) throw error
    }

    for (const item of toUpdate) {
      const { error } = await client
        .from(ITEMS_TABLE)
        .update(purchaseOrderItemToUpdateRow(item, updatedAt, updatedBy))
        .eq("purchase_order_id", poId)
        .eq("line_number", item.lineNumber)
      if (error) throw error
    }

    if (toSoftDelete.length > 0) {
      const { error } = await client
        .from(ITEMS_TABLE)
        .update({ deleted_at: updatedAt, updated_by: updatedBy })
        .in("id", toSoftDelete)
      if (error) throw error
    }

    return this.findById(poId)
  }

  async insertReceiptIdempotent(input: InsertReceiptInput): Promise<InsertReceiptResult> {
    const client = await getDatabaseClient()
    const intent = input.rollIntent ?? {}
    const payload = {
      tenant_id: input.tenantId,
      purchase_order_item_id: input.purchaseOrderItemId,
      idempotency_key: input.idempotencyKey,
      quantity_received_sqm: input.quantityReceivedSqm,
      received_date: input.receivedDate.toISOString().slice(0, 10),
      roll_requested: input.rollRequested,
      roll_width_mm: intent.widthMm ?? null,
      roll_length_mm: intent.lengthMm ?? null,
      roll_thickness_mm: intent.thicknessMm ?? null,
      roll_color: intent.color ?? null,
      roll_location: intent.location ?? null,
      roll_cost_per_sqm_cents: intent.costPerSqmCents ?? null,
      roll_notes: intent.notes ?? null,
      created_by: input.createdBy,
    }

    // ON CONFLICT DO NOTHING via supabase-js upsert with ignoreDuplicates;
    // matching the UNIQUE (purchase_order_item_id, idempotency_key) row
    // is left untouched and `select()` returns an empty array.
    const { data: inserted, error: insertError } = await client
      .from(RECEIPTS_TABLE)
      .upsert(payload, {
        ignoreDuplicates: true,
        onConflict: "purchase_order_item_id,idempotency_key",
      })
      .select("id")

    if (insertError) throw insertError

    if (inserted && inserted.length > 0) {
      return { receiptId: (inserted[0] as { id: string }).id, wasInserted: true }
    }

    // Conflict path: fetch the existing row's id so the caller has a stable
    // anchor (e.g., for downstream stamps even if the original caller died
    // before stamping).
    const { data: existing, error: existingError } = await client
      .from(RECEIPTS_TABLE)
      .select("id")
      .eq("purchase_order_item_id", input.purchaseOrderItemId)
      .eq("idempotency_key", input.idempotencyKey)
      .single()
    if (existingError) throw existingError

    return { receiptId: (existing as { id: string }).id, wasInserted: false }
  }

  async markReceiptApplied(receiptId: string): Promise<void> {
    const client = await getDatabaseClient()
    const { error } = await client
      .from(RECEIPTS_TABLE)
      .update({ applied_at: new Date().toISOString() })
      .eq("id", receiptId)
    if (error) throw error
  }

  async markReceiptRollCreated(receiptId: string): Promise<void> {
    const client = await getDatabaseClient()
    const { error } = await client
      .from(RECEIPTS_TABLE)
      .update({ roll_created_at: new Date().toISOString() })
      .eq("id", receiptId)
    if (error) throw error
  }

  async findReceiptById(receiptId: string): Promise<PoItemReceiptWithContext> {
    const client = await getDatabaseClient()
    // Single round-trip with the JOIN-style nested-select Supabase
    // supports: po_item_receipts → purchase_order_items → purchase_orders.
    // The use-case needs po_id + line_number + supplier_id + po_number to
    // call recordReceipt + build createRoll props without a second query.
    const { data, error } = await client
      .from(RECEIPTS_TABLE)
      .select(
        `
        id, tenant_id, purchase_order_item_id, idempotency_key,
        quantity_received_sqm, received_date, roll_requested,
        roll_width_mm, roll_length_mm, roll_thickness_mm,
        roll_color, roll_location, roll_cost_per_sqm_cents, roll_notes,
        applied_at, roll_created_at, created_at, created_by,
        purchase_order_items!inner (
          id, line_number, material_type_id, purchase_order_id,
          purchase_orders!inner (
            id, po_number, supplier_id, status
          )
        )
      `
      )
      .eq("id", receiptId)
      .single()
    if (error) throw error

    const row = data as unknown as ReceiptWithJoinRow
    const item = row.purchase_order_items
    const po = item.purchase_orders

    return {
      receiptId: row.id,
      tenantId: row.tenant_id,
      purchaseOrderItemId: row.purchase_order_item_id,
      idempotencyKey: row.idempotency_key,
      quantityReceivedSqm: Number(row.quantity_received_sqm),
      receivedDate: new Date(row.received_date),
      receiptCreatedAt: new Date(row.created_at),
      receiptCreatedBy: row.created_by,
      purchaseOrderId: item.purchase_order_id,
      lineNumber: item.line_number,
      materialTypeId: item.material_type_id,
      poNumber: po.po_number,
      supplierId: po.supplier_id,
      purchaseOrderStatus: po.status,
      rollWidthMm: row.roll_width_mm,
      rollLengthMm: row.roll_length_mm,
      rollThicknessMm: row.roll_thickness_mm,
      rollColor: row.roll_color,
      rollLocation: row.roll_location,
      rollCostPerSqmCents: row.roll_cost_per_sqm_cents,
      rollNotes: row.roll_notes,
      rollRequested: row.roll_requested,
      appliedAt: row.applied_at ? new Date(row.applied_at) : null,
      rollCreatedAt: row.roll_created_at ? new Date(row.roll_created_at) : null,
    }
  }

  async findPendingApplyReceipts(): Promise<PoReceiptReconciliationRow[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(PENDING_APPLY_VIEW)
      .select("*")
      .order("receipt_created_at", { ascending: false })
    if (error) throw error
    return ((data ?? []) as PendingApplyViewRow[]).map(mapPendingApplyRow)
  }

  async findPendingRollCreationReceipts(): Promise<PoReceiptReconciliationRow[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(PENDING_ROLL_VIEW)
      .select("*")
      .order("receipt_created_at", { ascending: false })
    if (error) throw error
    return ((data ?? []) as PendingRollViewRow[]).map(mapPendingRollRow)
  }

  private async findManyByQuery(
    build: (
      client: Awaited<ReturnType<typeof getDatabaseClient>>
    ) => PromiseLike<{ data: unknown; error: unknown }>
  ): Promise<PurchaseOrder[]> {
    const client = await getDatabaseClient()
    const { data, error } = await build(client)
    if (error) throw error
    const headers = (data ?? []) as PurchaseOrderRow[]
    if (headers.length === 0) return []

    const ids = headers.map((row) => row.id)
    const { data: itemRows, error: itemsError } = await client
      .from(ITEMS_TABLE)
      .select(ITEMS_COLUMNS)
      .in("purchase_order_id", ids)
      .is("deleted_at", null)
      .order("line_number", { ascending: true })
    if (itemsError) throw itemsError

    const itemsByPoId = new Map<string, PurchaseOrderItemRow[]>()
    for (const itemRow of (itemRows ?? []) as PurchaseOrderItemRow[]) {
      const list = itemsByPoId.get(itemRow.purchase_order_id) ?? []
      list.push(itemRow)
      itemsByPoId.set(itemRow.purchase_order_id, list)
    }

    return headers.map((header) =>
      rowToPurchaseOrder(header, itemsByPoId.get(header.id) ?? [], DEFAULT_CURRENCY)
    )
  }
}

export const purchaseOrdersRepository: IPurchaseOrdersRepository = new PurchaseOrdersRepository()
