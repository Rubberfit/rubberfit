import type { ReorderRule, ReorderRuleUpdateProps } from "@/src/entities/reorder-rule"
import type {
  MaterialTypeId,
  ProfileId,
  ReorderRuleId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"

/**
 * Input shape for `IReorderService.createRule`. Mirrors the entity's
 * `CreateReorderRuleProps` but takes the actor `ProfileId` as a
 * top-level required field rather than the optional `createdBy` slot —
 * the service layer is the auth-bound boundary.
 */
export interface CreateReorderRuleInput {
  id: ReorderRuleId
  tenantId: TenantId
  materialTypeId: MaterialTypeId
  supplierId?: SupplierId | null
  reorderPointSqm: number
  reorderQuantitySqm: number
  maxStockLevelSqm?: number | null
  leadTimeDays?: number
  safetyStockDays?: number
  autoReorder?: boolean
  notes?: string | null
  actor: ProfileId
}

/**
 * Narrow entity-typed orchestrator over `IReorderRulesRepository` +
 * `ReorderRule` entity transitions. Read-only DTO surfaces
 * (`generateReorderSuggestions`, `calculateCurrentStock`,
 * `generatePONumber`) live on `ILegacyReorderService` until their
 * consumer pages are themselves migrated.
 */
export interface IReorderService {
  // ─── Reads ──────────────────────────────────────────────────────────────

  getRuleById(id: string): Promise<ReorderRule>
  getActiveRules(): Promise<ReorderRule[]>
  getRuleByMaterialType(materialTypeId: string): Promise<ReorderRule | null>

  // ─── Writes ─────────────────────────────────────────────────────────────

  createRule(input: CreateReorderRuleInput): Promise<ReorderRule>

  updateRule(id: string, props: ReorderRuleUpdateProps, actor: ProfileId): Promise<ReorderRule>

  enableAutoReorder(id: string, actor: ProfileId): Promise<ReorderRule>
  disableAutoReorder(id: string, actor: ProfileId): Promise<ReorderRule>

  /** User-facing "remove rule" — flips active off; rule stops firing. */
  deactivate(id: string, actor: ProfileId): Promise<ReorderRule>
  reactivate(id: string, actor: ProfileId): Promise<ReorderRule>

  /**
   * System event: a PO was auto-generated (or low-stock alert fired)
   * for this rule. Bumps `lastTriggeredAt` only — does NOT bump
   * `updatedAt` / `updatedBy`. Distinct from human edits.
   */
  recordTrigger(id: string): Promise<ReorderRule>

  /** Admin-only soft delete. */
  softDelete(id: string, actor: ProfileId): Promise<ReorderRule>
}
