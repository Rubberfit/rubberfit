import { PurchaseOrder } from "@/src/entities/purchase-order"
import { PurchaseOrderItem } from "@/src/entities/purchase-order-item"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  AddressId,
  JobId,
  MaterialTypeId,
  ProfileId,
  PurchaseOrderId,
  ReorderRuleId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"
import type { PoStatus } from "@/src/entities/value-objects/po-status"

/**
 * Persistence shape for `purchase_orders`. Local row type — the
 * generated `PurchaseOrder` interface in `@/src/infrastructure/models/supabase`
 * still describes pre-redesign columns (`subtotal` decimal not
 * `subtotal_cents`, etc.).
 *
 * Mirrors `supabase/migrations/20260421000004_schema_commerce.sql`.
 */
export interface PurchaseOrderRow {
  id: string
  tenant_id: string
  supplier_id: string
  shipping_address_id: string | null
  billing_address_id: string | null
  reorder_rule_id: string | null
  job_id: string | null
  po_number: string
  status: PoStatus
  order_date: string | null
  requested_delivery_date: string | null
  actual_delivery_date: string | null
  subtotal_cents: number
  tax_amount_cents: number
  shipping_cost_cents: number
  total_amount_cents: number
  payment_terms: string | null
  notes: string | null
  auto_generated: boolean
  approved_by: string | null
  approved_at: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  deleted_at: string | null
}

/**
 * Persistence shape for `purchase_order_items`. `id` is a repo-internal
 * detail — the entity addresses lines by `lineNumber`. Carried here so
 * the repository can do row-level UPDATEs / DELETEs during sync without
 * delete-and-reinsert churn on every PO update.
 */
export interface PurchaseOrderItemRow {
  id: string
  tenant_id: string
  purchase_order_id: string
  material_type_id: string
  line_number: number
  description: string | null
  width_mm: number | null
  length_mm: number | null
  thickness_mm: number | null
  color: string | null
  quantity_sqm: number
  quantity_received_sqm: number
  unit_cost_cents: number
  line_total_cents: number
  received_date: string | null
  notes: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  deleted_at: string | null
}

export interface PurchaseOrderInsertRow {
  id: string
  tenant_id: string
  supplier_id: string
  shipping_address_id: string | null
  billing_address_id: string | null
  reorder_rule_id: string | null
  job_id: string | null
  po_number: string
  status: PoStatus
  order_date: string | null
  requested_delivery_date: string | null
  actual_delivery_date: string | null
  subtotal_cents: number
  tax_amount_cents: number
  shipping_cost_cents: number
  total_amount_cents: number
  payment_terms: string | null
  notes: string | null
  auto_generated: boolean
  approved_by: string | null
  approved_at: string | null
  created_by: string | null
}

export type PurchaseOrderUpdateRow = Partial<
  Pick<
    PurchaseOrderRow,
    | "supplier_id"
    | "shipping_address_id"
    | "billing_address_id"
    | "job_id"
    | "po_number"
    | "status"
    | "order_date"
    | "requested_delivery_date"
    | "actual_delivery_date"
    | "subtotal_cents"
    | "tax_amount_cents"
    | "shipping_cost_cents"
    | "total_amount_cents"
    | "payment_terms"
    | "notes"
    | "approved_by"
    | "approved_at"
    | "updated_at"
    | "updated_by"
    | "deleted_at"
  >
>

/**
 * Per-line UPDATE payload used by `repo.update(po)`'s child-sync pass.
 * The repo matches existing rows by `(purchase_order_id, line_number)`
 * and updates these mutable columns in place — avoiding the
 * delete-and-reinsert churn that would invalidate row IDs on every PO
 * mutation.
 */
export type PurchaseOrderItemUpdateRow = Partial<
  Pick<
    PurchaseOrderItemRow,
    | "material_type_id"
    | "description"
    | "width_mm"
    | "length_mm"
    | "thickness_mm"
    | "color"
    | "quantity_sqm"
    | "quantity_received_sqm"
    | "unit_cost_cents"
    | "line_total_cents"
    | "received_date"
    | "notes"
    | "updated_at"
    | "updated_by"
  >
>

export interface PurchaseOrderItemInsertRow {
  tenant_id: string
  purchase_order_id: string
  material_type_id: string
  line_number: number
  description: string | null
  width_mm: number | null
  length_mm: number | null
  thickness_mm: number | null
  color: string | null
  quantity_sqm: number
  quantity_received_sqm: number
  unit_cost_cents: number
  line_total_cents: number
  received_date: string | null
  notes: string | null
}

function rowDateToDate(value: string | null): Date | null {
  return value ? new Date(value) : null
}

function dateToRowDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

/**
 * Reconstitutes a PO line from its persistence row. `quantityReceivedSqm`
 * is enforced ≥ 0 and ≤ ordered by a DB CHECK; the entity validates
 * again at the boundary.
 */
/**
 * Reconstitutes a PO line from its persistence row via `PurchaseOrderItem.create`.
 * The DB-stored row has already passed CHECK constraints (positive
 * quantity, received ≤ ordered, etc.), so `create` validation is
 * effectively re-validation — but cheaper than introducing a separate
 * `reconstitute` factory just for the mapper.
 */
function rowToItem(row: PurchaseOrderItemRow, currency: Currency): PurchaseOrderItem {
  return PurchaseOrderItem.create({
    lineNumber: row.line_number,
    materialTypeId: MaterialTypeId.fromPersistence(row.material_type_id),
    description: row.description,
    widthMm: row.width_mm,
    lengthMm: row.length_mm,
    thicknessMm: row.thickness_mm,
    color: row.color,
    quantitySqm: row.quantity_sqm,
    quantityReceivedSqm: row.quantity_received_sqm,
    unitCost: Money.fromPersistence(row.unit_cost_cents, currency.value),
    lineTotal: Money.fromPersistence(row.line_total_cents, currency.value),
    receivedDate: rowDateToDate(row.received_date),
    notes: row.notes,
  })
}

/**
 * Reconstitutes a full `PurchaseOrder` aggregate. Items must be passed
 * in already sorted by `line_number` ascending — the entity preserves
 * caller order. The repository is responsible for joining
 * `purchase_order_items` with `deleted_at IS NULL` + `ORDER BY
 * line_number`.
 *
 * `currency` is supplied externally because the DB doesn't persist it on
 * the PO row (the `*_cents` columns just store integer cents). Default
 * USD until per-tenant currency resolution lands.
 */
export function rowToPurchaseOrder(
  row: PurchaseOrderRow,
  itemRows: PurchaseOrderItemRow[],
  currency: Currency
): PurchaseOrder {
  const items = itemRows.map((r) => rowToItem(r, currency))
  return PurchaseOrder.reconstitute({
    id: PurchaseOrderId.fromPersistence(row.id),
    tenantId: TenantId.fromPersistence(row.tenant_id),
    supplierId: SupplierId.fromPersistence(row.supplier_id),
    shippingAddressId: row.shipping_address_id
      ? AddressId.fromPersistence(row.shipping_address_id)
      : null,
    billingAddressId: row.billing_address_id
      ? AddressId.fromPersistence(row.billing_address_id)
      : null,
    reorderRuleId: row.reorder_rule_id ? ReorderRuleId.fromPersistence(row.reorder_rule_id) : null,
    jobId: row.job_id ? JobId.fromPersistence(row.job_id) : null,
    poNumber: row.po_number,
    status: row.status,
    orderDate: rowDateToDate(row.order_date),
    requestedDeliveryDate: rowDateToDate(row.requested_delivery_date),
    actualDeliveryDate: rowDateToDate(row.actual_delivery_date),
    subtotal: Money.fromPersistence(row.subtotal_cents, currency.value),
    taxAmount: Money.fromPersistence(row.tax_amount_cents, currency.value),
    shippingCost: Money.fromPersistence(row.shipping_cost_cents, currency.value),
    totalAmount: Money.fromPersistence(row.total_amount_cents, currency.value),
    paymentTerms: row.payment_terms,
    notes: row.notes,
    autoGenerated: row.auto_generated,
    approvedBy: row.approved_by ? ProfileId.fromPersistence(row.approved_by) : null,
    approvedAt: row.approved_at ? new Date(row.approved_at) : null,
    items,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by ? ProfileId.fromPersistence(row.created_by) : null,
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by ? ProfileId.fromPersistence(row.updated_by) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  })
}

export function purchaseOrderToInsertRow(po: PurchaseOrder): PurchaseOrderInsertRow {
  const snap = po.toJSON()
  return {
    id: snap.id,
    tenant_id: snap.tenantId,
    supplier_id: snap.supplierId,
    shipping_address_id: snap.shippingAddressId,
    billing_address_id: snap.billingAddressId,
    reorder_rule_id: snap.reorderRuleId,
    job_id: snap.jobId,
    po_number: snap.poNumber,
    status: snap.status,
    order_date: snap.orderDate ? snap.orderDate.slice(0, 10) : null,
    requested_delivery_date: snap.requestedDeliveryDate
      ? snap.requestedDeliveryDate.slice(0, 10)
      : null,
    actual_delivery_date: snap.actualDeliveryDate ? snap.actualDeliveryDate.slice(0, 10) : null,
    subtotal_cents: snap.subtotal.cents,
    tax_amount_cents: snap.taxAmount.cents,
    shipping_cost_cents: snap.shippingCost.cents,
    total_amount_cents: snap.totalAmount.cents,
    payment_terms: snap.paymentTerms,
    notes: snap.notes,
    auto_generated: snap.autoGenerated,
    approved_by: snap.approvedBy,
    approved_at: snap.approvedAt,
    created_by: snap.createdBy,
  }
}

export function purchaseOrderToUpdateRow(po: PurchaseOrder): PurchaseOrderUpdateRow {
  const snap = po.toJSON()
  return {
    supplier_id: snap.supplierId,
    shipping_address_id: snap.shippingAddressId,
    billing_address_id: snap.billingAddressId,
    job_id: snap.jobId,
    po_number: snap.poNumber,
    status: snap.status,
    order_date: snap.orderDate ? snap.orderDate.slice(0, 10) : null,
    requested_delivery_date: snap.requestedDeliveryDate
      ? snap.requestedDeliveryDate.slice(0, 10)
      : null,
    actual_delivery_date: snap.actualDeliveryDate ? snap.actualDeliveryDate.slice(0, 10) : null,
    subtotal_cents: snap.subtotal.cents,
    tax_amount_cents: snap.taxAmount.cents,
    shipping_cost_cents: snap.shippingCost.cents,
    total_amount_cents: snap.totalAmount.cents,
    payment_terms: snap.paymentTerms,
    notes: snap.notes,
    approved_by: snap.approvedBy,
    approved_at: snap.approvedAt,
    updated_at: snap.updatedAt,
    updated_by: snap.updatedBy,
    deleted_at: snap.deletedAt,
  }
}

/**
 * Builds an insert payload for a new PO item. `tenant_id` and
 * `purchase_order_id` are passed explicitly because items don't own
 * those fields on the entity — they're carried by the aggregate root.
 */
export function purchaseOrderItemToInsertRow(
  item: PurchaseOrderItem,
  purchaseOrderId: string,
  tenantId: string
): PurchaseOrderItemInsertRow {
  const snap = item.toJSON()
  return {
    tenant_id: tenantId,
    purchase_order_id: purchaseOrderId,
    material_type_id: snap.materialTypeId,
    line_number: snap.lineNumber,
    description: snap.description,
    width_mm: snap.widthMm,
    length_mm: snap.lengthMm,
    thickness_mm: snap.thicknessMm,
    color: snap.color,
    quantity_sqm: snap.quantitySqm,
    quantity_received_sqm: snap.quantityReceivedSqm,
    unit_cost_cents: snap.unitCost.cents,
    line_total_cents: snap.lineTotal.cents,
    received_date: snap.receivedDate ? snap.receivedDate.slice(0, 10) : null,
    notes: snap.notes,
  }
}

/**
 * Builds an UPDATE payload for an existing PO item row. The repo
 * matches by `(purchase_order_id, line_number)`. `updated_at` /
 * `updated_by` get stamped by the repo from the aggregate's audit
 * fields — items don't carry their own audit on the entity.
 */
export function purchaseOrderItemToUpdateRow(
  item: PurchaseOrderItem,
  updatedAt: string,
  updatedBy: string | null
): PurchaseOrderItemUpdateRow {
  const snap = item.toJSON()
  return {
    material_type_id: snap.materialTypeId,
    description: snap.description,
    width_mm: snap.widthMm,
    length_mm: snap.lengthMm,
    thickness_mm: snap.thicknessMm,
    color: snap.color,
    quantity_sqm: snap.quantitySqm,
    quantity_received_sqm: snap.quantityReceivedSqm,
    unit_cost_cents: snap.unitCost.cents,
    line_total_cents: snap.lineTotal.cents,
    received_date: snap.receivedDate ? snap.receivedDate.slice(0, 10) : null,
    notes: snap.notes,
    updated_at: updatedAt,
    updated_by: updatedBy,
  }
}
