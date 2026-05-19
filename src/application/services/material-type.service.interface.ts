import type { CreateMaterialTypeProps, MaterialType } from "@/src/entities/material-type"
import type { ProfileId } from "@/src/entities/value-objects/id"

/**
 * Material-types service. All methods return `MaterialType` entity
 * instances. Pricing is NOT on this aggregate — it lives on
 * `material_suppliers` (one material can be sourced from multiple
 * suppliers at different costs).
 *
 * "Delete" here is soft-delete: the row stays in the table so existing
 * FKs (rolls, reorder_rules, material_suppliers) keep their reference.
 * Pre-flight FK error handling lives on the action layer.
 */
export interface IMaterialTypeService {
  getAll(): Promise<MaterialType[]>
  getById(id: string): Promise<MaterialType>
  getByIds(ids: string[]): Promise<MaterialType[]>
  createMaterialType(props: CreateMaterialTypeProps): Promise<MaterialType>
  updateMaterialType(
    id: string,
    updates: {
      name: string
      description: string | null
      minStockSqm: number | null
    },
    actor: ProfileId
  ): Promise<MaterialType>
  softDeleteMaterialType(id: string, actor: ProfileId): Promise<MaterialType>
}
