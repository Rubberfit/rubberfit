import { MaterialType } from "@/src/entities/material-type"
import { MaterialTypeId, ProfileId, TenantId } from "@/src/entities/value-objects/id"

/**
 * Persistence shape for `material_types`. Locally defined — the legacy
 * type in `@/src/infrastructure/models/supabase` references stale
 * columns (`user_id`, `default_cost`, `min_stock_alert`) that no longer
 * exist in the redesigned schema; the live schema uses `tenant_id`,
 * `description`, `min_stock_sqm`, and the standard audit columns.
 */
export interface MaterialTypeRow {
  id: string
  tenant_id: string
  name: string
  description: string | null
  min_stock_sqm: number | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  deleted_at: string | null
}

export interface MaterialTypeInsertRow {
  id: string
  tenant_id: string
  name: string
  description: string | null
  min_stock_sqm: number | null
  created_by: string | null
}

export type MaterialTypeUpdateRow = Partial<
  Pick<
    MaterialTypeRow,
    "name" | "description" | "min_stock_sqm" | "updated_at" | "updated_by" | "deleted_at"
  >
>

export function rowToMaterialType(row: MaterialTypeRow): MaterialType {
  return MaterialType.reconstitute({
    id: MaterialTypeId.fromPersistence(row.id),
    tenantId: TenantId.fromPersistence(row.tenant_id),
    name: row.name,
    description: row.description,
    minStockSqm: row.min_stock_sqm,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by ? ProfileId.fromPersistence(row.created_by) : null,
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by ? ProfileId.fromPersistence(row.updated_by) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  })
}

export function materialTypeToInsertRow(mt: MaterialType): MaterialTypeInsertRow {
  return {
    id: mt.id.value,
    tenant_id: mt.tenantId.value,
    name: mt.name,
    description: mt.description,
    min_stock_sqm: mt.minStockSqm,
    created_by: mt.createdBy?.value ?? null,
  }
}

export function materialTypeToUpdateRow(mt: MaterialType): MaterialTypeUpdateRow {
  return {
    name: mt.name,
    description: mt.description,
    min_stock_sqm: mt.minStockSqm,
    updated_at: mt.updatedAt.toISOString(),
    updated_by: mt.updatedBy?.value ?? null,
    deleted_at: mt.deletedAt?.toISOString() ?? null,
  }
}
