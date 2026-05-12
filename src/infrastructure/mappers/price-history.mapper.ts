import { PriceHistory } from "@/src/entities/price-history"
import {
  MaterialSupplierId,
  PriceHistoryId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Currency } from "@/src/entities/value-objects/currency"
import { Money } from "@/src/entities/value-objects/money"

/**
 * Persistence shape for `price_history`. Append-only audit table — no
 * `updated_at` / `deleted_at` columns, so no update row type and no
 * soft-delete codec. The legacy `PriceHistory` type in
 * `models/supabase.ts` references the removed `cost_per_sqft` columns;
 * this local type tracks the real schema.
 */
export interface PriceHistoryRow {
  id: string
  tenant_id: string
  material_supplier_id: string
  old_cost_per_sqm_cents: number | null
  new_cost_per_sqm_cents: number
  price_change_percentage: number | null
  change_reason: string | null
  effective_date: string
  changed_by: string | null
  notes: string | null
  created_at: string
}

export interface PriceHistoryInsertRow {
  id: string
  tenant_id: string
  material_supplier_id: string
  old_cost_per_sqm_cents: number | null
  new_cost_per_sqm_cents: number
  price_change_percentage: number | null
  change_reason: string | null
  effective_date: string
  changed_by: string | null
  notes: string | null
}

/**
 * Same default-currency rationale as the supplier + material-supplier
 * mappers: until a per-tenant currency column lands, prices are
 * tenant-level USD. The DB stores only cents.
 */
const DEFAULT_CURRENCY = Currency.fromPersistence("USD")

function rowDateToDate(value: string): Date {
  return new Date(value)
}

function dateToRowDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function rowToPriceHistory(row: PriceHistoryRow): PriceHistory {
  return PriceHistory.reconstitute({
    id: PriceHistoryId.fromPersistence(row.id),
    tenantId: TenantId.fromPersistence(row.tenant_id),
    materialSupplierId: MaterialSupplierId.fromPersistence(row.material_supplier_id),
    oldCost:
      row.old_cost_per_sqm_cents !== null
        ? Money.fromPersistence(row.old_cost_per_sqm_cents, DEFAULT_CURRENCY.value)
        : null,
    newCost: Money.fromPersistence(row.new_cost_per_sqm_cents, DEFAULT_CURRENCY.value),
    priceChangePercentage: row.price_change_percentage,
    changeReason: row.change_reason,
    effectiveDate: rowDateToDate(row.effective_date),
    changedBy: row.changed_by ? ProfileId.fromPersistence(row.changed_by) : null,
    notes: row.notes,
    createdAt: new Date(row.created_at),
  })
}

export function priceHistoryToInsertRow(entry: PriceHistory): PriceHistoryInsertRow {
  return {
    id: entry.id.value,
    tenant_id: entry.tenantId.value,
    material_supplier_id: entry.materialSupplierId.value,
    old_cost_per_sqm_cents: entry.oldCost?.cents ?? null,
    new_cost_per_sqm_cents: entry.newCost.cents,
    price_change_percentage: entry.priceChangePercentage,
    change_reason: entry.changeReason,
    effective_date: dateToRowDate(entry.effectiveDate),
    changed_by: entry.changedBy?.value ?? null,
    notes: entry.notes,
  }
}
