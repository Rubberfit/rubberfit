import { ReorderRule } from "@/src/entities/reorder-rule"
import {
  MaterialTypeId,
  ProfileId,
  ReorderRuleId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"

/**
 * Persistence shape for the `reorder_rules` table. Mirrors the columns
 * defined in `supabase/migrations/20260421000002_schema_inventory.sql`.
 *
 * Note: the column is `active` (not `is_active`) — the entity exposes
 * `isActive` for callers but the row column name stays as-is.
 */
export interface ReorderRuleRow {
  id: string
  tenant_id: string
  material_type_id: string
  supplier_id: string | null
  reorder_point_sqm: number
  reorder_quantity_sqm: number
  max_stock_level_sqm: number | null
  lead_time_days: number
  safety_stock_days: number
  auto_reorder: boolean
  active: boolean
  notes: string | null
  last_triggered_at: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  deleted_at: string | null
}

export interface ReorderRuleInsertRow {
  id: string
  tenant_id: string
  material_type_id: string
  supplier_id: string | null
  reorder_point_sqm: number
  reorder_quantity_sqm: number
  max_stock_level_sqm: number | null
  lead_time_days: number
  safety_stock_days: number
  auto_reorder: boolean
  active: boolean
  notes: string | null
  created_by: string | null
}

export type ReorderRuleUpdateRow = Partial<
  Pick<
    ReorderRuleRow,
    | "supplier_id"
    | "reorder_point_sqm"
    | "reorder_quantity_sqm"
    | "max_stock_level_sqm"
    | "lead_time_days"
    | "safety_stock_days"
    | "auto_reorder"
    | "active"
    | "notes"
    | "last_triggered_at"
    | "updated_at"
    | "updated_by"
    | "deleted_at"
  >
>

export function rowToReorderRule(row: ReorderRuleRow): ReorderRule {
  return ReorderRule.reconstitute({
    id: ReorderRuleId.fromPersistence(row.id),
    tenantId: TenantId.fromPersistence(row.tenant_id),
    materialTypeId: MaterialTypeId.fromPersistence(row.material_type_id),
    supplierId: row.supplier_id ? SupplierId.fromPersistence(row.supplier_id) : null,
    reorderPointSqm: row.reorder_point_sqm,
    reorderQuantitySqm: row.reorder_quantity_sqm,
    maxStockLevelSqm: row.max_stock_level_sqm,
    leadTimeDays: row.lead_time_days,
    safetyStockDays: row.safety_stock_days,
    autoReorder: row.auto_reorder,
    isActive: row.active,
    notes: row.notes,
    lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at) : null,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by ? ProfileId.fromPersistence(row.created_by) : null,
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by ? ProfileId.fromPersistence(row.updated_by) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  })
}

export function reorderRuleToInsertRow(rule: ReorderRule): ReorderRuleInsertRow {
  return {
    id: rule.id.value,
    tenant_id: rule.tenantId.value,
    material_type_id: rule.materialTypeId.value,
    supplier_id: rule.supplierId?.value ?? null,
    reorder_point_sqm: rule.reorderPointSqm,
    reorder_quantity_sqm: rule.reorderQuantitySqm,
    max_stock_level_sqm: rule.maxStockLevelSqm,
    lead_time_days: rule.leadTimeDays,
    safety_stock_days: rule.safetyStockDays,
    auto_reorder: rule.autoReorder,
    active: rule.isActive,
    notes: rule.notes,
    created_by: rule.createdBy?.value ?? null,
  }
}

export function reorderRuleToUpdateRow(rule: ReorderRule): ReorderRuleUpdateRow {
  return {
    supplier_id: rule.supplierId?.value ?? null,
    reorder_point_sqm: rule.reorderPointSqm,
    reorder_quantity_sqm: rule.reorderQuantitySqm,
    max_stock_level_sqm: rule.maxStockLevelSqm,
    lead_time_days: rule.leadTimeDays,
    safety_stock_days: rule.safetyStockDays,
    auto_reorder: rule.autoReorder,
    active: rule.isActive,
    notes: rule.notes,
    last_triggered_at: rule.lastTriggeredAt?.toISOString() ?? null,
    updated_at: rule.updatedAt.toISOString(),
    updated_by: rule.updatedBy?.value ?? null,
    deleted_at: rule.deletedAt?.toISOString() ?? null,
  }
}
