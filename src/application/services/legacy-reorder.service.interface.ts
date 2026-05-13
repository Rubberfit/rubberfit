import type {
  CreateReorderRule,
  ReorderRuleWithDetails,
  UpdateReorderRule,
} from "@/src/infrastructure/models/supabase"

/**
 * Pre-DDD reorder surface. Wide bag of raw-row CRUD + read-side DTOs +
 * a calculation pass-through, retained as a shim so the existing
 * reorder UI, RF api-client, and server actions keep working without
 * a UI rewrite. New code should resolve `IReorderService` instead.
 *
 * Methods dropped from the legacy surface (Codex-verified unreachable
 * from non-test code, May 2026): `checkReorderPoints`,
 * `createAutomaticPurchaseOrder`, `calculateSuggestedQuantity`,
 * `estimateReorderCost`, `determineUrgency`, `generateReorderReason`,
 * `calculateOptimalOrderQuantity`, `generatePONumber` (canonical
 * version lives on `purchaseOrderService`). Suggestion-generation now
 * flows through `IGenerateReorderSuggestionsUseCase`; this interface
 * keeps `generateReorderSuggestions` only because the RF api-client +
 * the inventory/reorder UI fetcher still call the legacy version inline.
 *
 * Retires when each consumer page is itself migrated.
 *
 * @deprecated New code: use `IReorderService` (entity-typed) and the
 * generate-reorder-suggestions use-case.
 */
export interface ReorderSuggestion {
  materialTypeId: string
  materialName: string
  supplierId?: string
  supplierName?: string
  currentStock: number
  reorderPoint: number
  suggestedQuantity: number
  estimatedCost: number
  urgency: "critical" | "high" | "normal" | "low"
  reason: string
  reorderRuleId?: string
}

/** @deprecated See {@link ILegacyReorderService}. */
export interface ILegacyReorderService {
  getAllReorderRules(): Promise<ReorderRuleWithDetails[]>
  getActiveReorderRules(): Promise<ReorderRuleWithDetails[]>
  getReorderRuleById(id: string): Promise<ReorderRuleWithDetails>
  getReorderRuleByMaterial(materialTypeId: string): Promise<ReorderRuleWithDetails | null>
  createReorderRule(rule: CreateReorderRule): Promise<ReorderRuleWithDetails>
  updateReorderRule(
    id: string,
    updates: UpdateReorderRule,
    userId?: string
  ): Promise<ReorderRuleWithDetails>
  deleteReorderRule(id: string): Promise<boolean>
  bulkUpdateReorderRules(
    updates: Array<{ id: string; updates: UpdateReorderRule }>
  ): Promise<ReorderRuleWithDetails[]>

  /**
   * @deprecated Inline suggestion-generation. Use
   * `IGenerateReorderSuggestionsUseCase` in new code.
   */
  generateReorderSuggestions(includeInactive?: boolean): Promise<ReorderSuggestion[]>

  /** Used by the reorder action / data-fetcher to attach stock to rules. */
  calculateCurrentStock(materialTypeId: string): Promise<number>
}
