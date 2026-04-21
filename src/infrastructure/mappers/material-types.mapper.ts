import type { Database } from "@/src/infrastructure/models/database.types"
import {
  Area,
  type CreateMaterialType,
  type MaterialType,
  type UpdateMaterialType,
} from "@/src/entities"

type MaterialTypeRow = Database["public"]["Tables"]["material_types"]["Row"]
type MaterialTypeInsert = Database["public"]["Tables"]["material_types"]["Insert"]
type MaterialTypeUpdate = Database["public"]["Tables"]["material_types"]["Update"]

export function mapRowToMaterialType(row: MaterialTypeRow): MaterialType {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    minStock: row.min_stock_sqm !== null ? Area.fromSqm(Number(row.min_stock_sqm)) : null,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
  }
}

export function mapCreateMaterialTypeToInsert(input: CreateMaterialType): MaterialTypeInsert {
  return {
    tenant_id: input.tenantId,
    name: input.name,
    description: input.description,
    min_stock_sqm: input.minStock?.toSqm() ?? null,
  }
}

export function mapUpdateMaterialTypeToUpdate(patch: UpdateMaterialType): MaterialTypeUpdate {
  const update: MaterialTypeUpdate = {}
  if (patch.tenantId !== undefined) update.tenant_id = patch.tenantId
  if (patch.name !== undefined) update.name = patch.name
  if (patch.description !== undefined) update.description = patch.description
  if (patch.minStock !== undefined) update.min_stock_sqm = patch.minStock?.toSqm() ?? null
  return update
}
