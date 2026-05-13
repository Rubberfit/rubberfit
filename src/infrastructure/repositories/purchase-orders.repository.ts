import "reflect-metadata"
import { injectable } from "tsyringe"

import { PurchaseOrder } from "@/src/entities/purchase-order"
import { Currency } from "@/src/entities/value-objects/currency"
import type { PoStatus } from "@/src/entities/value-objects/po-status"
import type { IPurchaseOrdersRepository } from "@/src/application/repositories/purchase-orders.repository.interface"
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
const PO_COLUMNS = "*"
const ITEMS_COLUMNS = "*"

/**
 * Tenant-level currency resolution lands with the tenant-settings
 * migration. Until then, every PO is hydrated at USD — matches the
 * existing pre-DDD codebase, which already assumed USD throughout.
 */
const DEFAULT_CURRENCY = Currency.fromPersistence("USD")

@injectable()
export class PurchaseOrdersRepository implements IPurchaseOrdersRepository {
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
