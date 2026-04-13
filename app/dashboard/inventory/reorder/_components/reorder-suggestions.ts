import type { MaterialType, ReorderRuleWithDetails } from "@/src/infrastructure/models/supabase"
import type {
  IGenerateReorderSuggestionsUseCase,
  ReorderSuggestionOutput,
} from "@/src/application/use-cases/reorder/generate-reorder-suggestions.use-case"
import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"

export type ReorderSuggestion = ReorderSuggestionOutput

export async function generateReorderSuggestions(
  rules: ReorderRuleWithDetails[],
  _materials: MaterialType[],
  pendingPOs: Array<{ items?: Array<{ material_type_id: string; quantity_sqft: number }> }> = []
): Promise<ReorderSuggestion[]> {
  const useCase = resolveUseCase<IGenerateReorderSuggestionsUseCase>(
    TOKENS.IGenerateReorderSuggestionsUseCase
  )
  return useCase.execute({
    rules,
    materials: _materials,
    pendingPOs,
  })
}

export function getStockStatus(current: number, reorderPoint: number, max: number) {
  const percentage = (current / max) * 100
  if (current <= reorderPoint) return { status: "low", color: "bg-red-500" }
  if (percentage < 50) return { status: "medium", color: "bg-yellow-500" }
  return { status: "ok", color: "bg-green-500" }
}
