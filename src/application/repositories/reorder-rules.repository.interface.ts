import type { ReorderRule } from "@/src/entities/reorder-rule"

/**
 * Reorder-rules persistence boundary. Narrow entity-typed surface only —
 * the legacy raw-row methods that the existing reorder UI / RF api-client
 * still need live on `ILegacyReorderService`, not here.
 */
export interface IReorderRulesRepository {
  /** Returns the entity for `id`, or throws if not found. */
  findById(id: string): Promise<ReorderRule>

  /** Active, non-deleted rules, oldest-material-first. */
  findActive(): Promise<ReorderRule[]>

  /**
   * The single active rule attached to `materialTypeId`, or `null` if
   * the material has no rule. UNIQUE on (tenant, material) is enforced
   * at the DB; the optional return mirrors the "no rule yet" case.
   */
  findByMaterialType(materialTypeId: string): Promise<ReorderRule | null>

  /** Persists a freshly-built `ReorderRule` entity. */
  insert(rule: ReorderRule): Promise<ReorderRule>

  /**
   * Persists state-transition mutations by flattening the mutable
   * fields onto the row. Caller has already invoked the entity mutator.
   */
  update(rule: ReorderRule): Promise<ReorderRule>
}
