import type { Roll as RollEntity } from "@/src/entities/roll"
import type { Roll, RollReusableOffcutSummary } from "@/src/infrastructure/models/supabase"

/**
 * Rolls persistence boundary. Mixed-return interface during the DDD
 * migration:
 *
 * - Entity-typed methods (`findById`, `findActive`, `findByMaterialType`,
 *   `findChildOffcuts`, `insert`, `update`, `softDelete`) are the
 *   canonical surface used by the new `RollService`. They return
 *   `RollEntity` instances reconstituted from the new schema columns
 *   (`material_type_id`, `cost_per_sqm_cents`, `source_type`, etc.).
 *
 * - Raw-row methods (`getAllRolls`, `getActiveRolls`, `getRollById`,
 *   `addRoll`, `updateRoll`, `markAsDepleted`, `markRollDepleted`,
 *   `getInventoryValue`, `searchRolls`, `getLowStockCount`,
 *   `deleteRoll`, `getRecentRolls`, `getRecentlyUpdatedRolls`,
 *   `existsByMaterialType`, `getRollMaterialTypeMap`, `bulkAddRolls`,
 *   `getInventoryGrowthPercentage`, `getThicknessesByMaterialType`,
 *   `getReusableOffcutSummary`, `getChildOffcuts`) are deprecated; they
 *   return the pre-redesign `Roll` row shape that the inventory /
 *   cutting / dashboard UI pages still consume. They retire with each
 *   UI surface's own migration commit.
 */
export interface IRollsRepository {
  // ─── Entity-typed (new DDD surface) ─────────────────────────────────────

  /** Returns the entity for `id`, or throws if not found. */
  findById(id: string): Promise<RollEntity>

  /** Active, non-deleted rolls, newest first. */
  findActive(): Promise<RollEntity[]>

  /** Rolls of a given material type, newest first. */
  findByMaterialType(materialTypeId: string): Promise<RollEntity[]>

  /** Offcut rolls spawned from the given parent roll, newest first. */
  findChildOffcuts(parentRollId: string): Promise<RollEntity[]>

  /** Persists a freshly-built `Roll` entity. Returns the rehydrated entity. */
  insert(roll: RollEntity): Promise<RollEntity>

  /**
   * Persists state-transition mutations (consume / reserve / release /
   * relocate / notes / barcode / QR / soft-delete) by flattening the
   * mutable fields onto the row. Caller has already invoked the entity
   * mutator and is the source of truth for the new state.
   */
  update(roll: RollEntity): Promise<RollEntity>

  // ─── Legacy raw-row surface (pre-redesign Row shape) ────────────────────

  /** @deprecated Raw-row read; use `findActive` for entity-typed reads. */
  getAllRolls(): Promise<Roll[]>
  /** @deprecated Raw-row read; use `findActive` for entity-typed reads. */
  getActiveRolls(): Promise<Roll[]>
  /** @deprecated Raw-row read; use `findById` for entity-typed reads. */
  getRollById(id: string): Promise<Roll>
  /** @deprecated Raw-row write; use `insert(RollEntity)` in new code. */
  addRoll(
    roll: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">,
    userId?: string
  ): Promise<Roll>
  /** @deprecated Raw-row write; use entity mutators + `update(RollEntity)` in new code. */
  updateRoll(id: string, updates: Partial<Roll>): Promise<Roll>
  /** @deprecated Use `Roll.consumeLength(...)` then `update(roll)` in new code. */
  markAsDepleted(id: string): Promise<Roll>
  /** @deprecated Use `Roll.consumeLength(...)` then `update(roll)` in new code. */
  markRollDepleted(id: string): Promise<Roll>
  /** @deprecated Dashboard summary card — retires with the dashboard UI rewrite. */
  getInventoryValue(): Promise<number>
  /** @deprecated Inventory page text-search — retires with the inventory UI rewrite. */
  searchRolls(query: string): Promise<Roll[]>
  /** @deprecated Dashboard summary card — retires with the dashboard UI rewrite. */
  getLowStockCount(): Promise<number>
  /** @deprecated Hard-delete; prefer `softDelete` on the entity + `update(roll)`. */
  deleteRoll(id: string): Promise<void>
  /** @deprecated Dashboard recent-activity card — retires with the dashboard UI rewrite. */
  getRecentRolls(limit: number): Promise<Roll[]>
  /** @deprecated Dashboard recent-activity card — retires with the dashboard UI rewrite. */
  getRecentlyUpdatedRolls(limit: number): Promise<Roll[]>
  /** @deprecated Material-types page — text-based lookup that predates the FK rewrite. */
  existsByMaterialType(materialTypeName: string): Promise<boolean>
  /** @deprecated Cutting-engine helper — retires with the cutting UI rewrite. */
  getRollMaterialTypeMap(): Promise<Map<string, string>>
  /** @deprecated Import flow — retires when bulk import is rewritten against entities. */
  bulkAddRolls(
    rolls: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">[],
    batchSize?: number
  ): Promise<{ imported: number; total: number }>
  /** @deprecated Dashboard summary card — retires with the dashboard UI rewrite. */
  getInventoryGrowthPercentage(): Promise<number>
  /** @deprecated Cutting-engine helper — retires with the cutting UI rewrite. */
  getThicknessesByMaterialType(materialType: string): Promise<number[]>
  /**
   * @deprecated Inventory drawer aggregate. Returns null when the
   * companion migration column is missing in the environment.
   */
  getReusableOffcutSummary(rollId: string): Promise<RollReusableOffcutSummary | null>
  /**
   * @deprecated Raw-row offcut listing; use `findChildOffcuts` for the
   * entity-typed read.
   */
  getChildOffcuts(parentRollId: string): Promise<Roll[]>
}
