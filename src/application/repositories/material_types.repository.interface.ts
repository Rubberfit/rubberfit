import type { MaterialType as MaterialTypeEntity } from "@/src/entities/material-type"
import type { MaterialType } from "@/src/infrastructure/models/supabase"

/**
 * Material-types persistence boundary. Mixed-return interface during
 * the DDD migration:
 *
 * - Entity-typed methods (`findAll`, `findById`, `findByIds`, `insert`,
 *   `updateEntity`) are the canonical surface used by the
 *   `MaterialTypeService`. They return `MaterialType` entity instances.
 * - Raw-row methods (`getAll`, `getByIds`, `getNames`, `getTopByCost`,
 *   `create`, `update`, `delete`) keep the legacy snake_case shape for
 *   the few remaining consumers not yet migrated (pricing-page service,
 *   parity test mocks). The `legacyMaterialTypeService` re-export shim
 *   was deleted 2026-05-15.
 */
export interface IMaterialTypeRepository {
  // ─── Entity-typed (new DDD surface) ───────────────────────────────────
  findAll(): Promise<MaterialTypeEntity[]>
  findById(id: string): Promise<MaterialTypeEntity>
  findByIds(ids: string[]): Promise<MaterialTypeEntity[]>
  insert(entity: MaterialTypeEntity): Promise<MaterialTypeEntity>
  updateEntity(entity: MaterialTypeEntity): Promise<MaterialTypeEntity>

  // ─── Legacy raw-row surface (pre-DDD consumers) ───────────────────────
  /** @deprecated Use findAll(). */
  getAll(): Promise<MaterialType[]>
  /** @deprecated Use findByIds(). */
  getByIds(ids: string[]): Promise<MaterialType[]>
  /** @deprecated Reads legacy snake_case shape; new consumers use entity getters. */
  getNames(): Promise<Pick<MaterialType, "id" | "name">[]>
  /** @deprecated References `default_cost` which is no longer on `material_types`. */
  getTopByCost(limit: number): Promise<MaterialType[]>
  /** @deprecated Use insert(MaterialType.create(...)). */
  create(
    material: Omit<MaterialType, "id" | "user_id" | "created_at" | "updated_at">,
    userId?: string
  ): Promise<MaterialType>
  /** @deprecated Use updateEntity(). */
  update(id: string, updates: Partial<MaterialType>): Promise<MaterialType>
  /** @deprecated Hard delete. New code uses softDelete via the entity. */
  delete(id: string): Promise<void>
}
