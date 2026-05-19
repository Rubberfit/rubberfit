import { MaterialSupplier } from "@/src/entities/material-supplier"
import {
  MaterialSupplierId,
  MaterialTypeId,
  ProfileId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Currency } from "@/src/entities/value-objects/currency"
import { Money } from "@/src/entities/value-objects/money"

/**
 * Persistence shape for the `material_suppliers` table. Local row type
 * — same reasoning as `supplier.mapper.ts`: the stale `MaterialSupplier`
 * type in `@/src/infrastructure/models/supabase` references pre-redesign
 * columns (`cost_per_sqft`, `minimum_order_sqft`, `user_id`) that no
 * longer exist in the live schema.
 */
export interface MaterialSupplierRow {
  id: string
  tenant_id: string
  material_type_id: string
  supplier_id: string
  supplier_material_code: string | null
  cost_per_sqm_cents: number
  minimum_order_sqm: number
  lead_time_days: number
  preferred_supplier: boolean
  active: boolean
  notes: string | null
  effective_date: string
  expiration_date: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  deleted_at: string | null
}

export interface MaterialSupplierInsertRow {
  id: string
  tenant_id: string
  material_type_id: string
  supplier_id: string
  supplier_material_code: string | null
  cost_per_sqm_cents: number
  minimum_order_sqm: number
  lead_time_days: number
  preferred_supplier: boolean
  active: boolean
  notes: string | null
  effective_date: string
  expiration_date: string | null
  created_by: string | null
}

export type MaterialSupplierUpdateRow = Partial<
  Pick<
    MaterialSupplierRow,
    | "supplier_material_code"
    | "cost_per_sqm_cents"
    | "minimum_order_sqm"
    | "lead_time_days"
    | "preferred_supplier"
    | "active"
    | "notes"
    | "effective_date"
    | "expiration_date"
    | "updated_at"
    | "updated_by"
    | "deleted_at"
  >
>

/**
 * material_suppliers.cost_per_sqm_cents has no currency column —
 * pricing assumes tenant-level currency. Default USD on read; the
 * supplier mapper makes the same call.
 */
const DEFAULT_CURRENCY = Currency.fromPersistence("USD")

/**
 * Persistence-date helper. material_suppliers stores `effective_date`
 * / `expiration_date` as `date` (no time component); Supabase returns
 * an ISO string like `"2026-04-21"`. Wrap in `new Date(...)` which
 * parses it as UTC midnight — round-trips cleanly through
 * `.toISOString().slice(0, 10)` on write.
 */
function rowDateToDate(value: string): Date {
  return new Date(value)
}

function dateToRowDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function rowToMaterialSupplier(row: MaterialSupplierRow): MaterialSupplier {
  return MaterialSupplier.reconstitute({
    id: MaterialSupplierId.fromPersistence(row.id),
    tenantId: TenantId.fromPersistence(row.tenant_id),
    materialTypeId: MaterialTypeId.fromPersistence(row.material_type_id),
    supplierId: SupplierId.fromPersistence(row.supplier_id),
    cost: Money.fromPersistence(row.cost_per_sqm_cents, DEFAULT_CURRENCY.value),
    effectiveDate: rowDateToDate(row.effective_date),
    expirationDate: row.expiration_date ? rowDateToDate(row.expiration_date) : null,
    supplierMaterialCode: row.supplier_material_code,
    minimumOrderSqm: row.minimum_order_sqm,
    leadTimeDays: row.lead_time_days,
    preferredSupplier: row.preferred_supplier,
    isActive: row.active,
    notes: row.notes,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by ? ProfileId.fromPersistence(row.created_by) : null,
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by ? ProfileId.fromPersistence(row.updated_by) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  })
}

export function materialSupplierToInsertRow(link: MaterialSupplier): MaterialSupplierInsertRow {
  return {
    id: link.id.value,
    tenant_id: link.tenantId.value,
    material_type_id: link.materialTypeId.value,
    supplier_id: link.supplierId.value,
    supplier_material_code: link.supplierMaterialCode,
    cost_per_sqm_cents: link.cost.cents,
    minimum_order_sqm: link.minimumOrderSqm,
    lead_time_days: link.leadTimeDays,
    preferred_supplier: link.preferredSupplier,
    active: link.isActive,
    notes: link.notes,
    effective_date: dateToRowDate(link.effectiveDate),
    expiration_date: link.expirationDate ? dateToRowDate(link.expirationDate) : null,
    created_by: link.createdBy?.value ?? null,
  }
}

export function materialSupplierToUpdateRow(link: MaterialSupplier): MaterialSupplierUpdateRow {
  return {
    supplier_material_code: link.supplierMaterialCode,
    cost_per_sqm_cents: link.cost.cents,
    minimum_order_sqm: link.minimumOrderSqm,
    lead_time_days: link.leadTimeDays,
    preferred_supplier: link.preferredSupplier,
    active: link.isActive,
    notes: link.notes,
    effective_date: dateToRowDate(link.effectiveDate),
    expiration_date: link.expirationDate ? dateToRowDate(link.expirationDate) : null,
    updated_at: link.updatedAt.toISOString(),
    updated_by: link.updatedBy?.value ?? null,
    deleted_at: link.deletedAt?.toISOString() ?? null,
  }
}
