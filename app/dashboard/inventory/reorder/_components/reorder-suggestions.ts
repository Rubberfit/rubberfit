import type { ReorderRuleWithDetails } from "@/src/infrastructure/models/supabase"
import type { ReorderSuggestionOutput } from "@/src/application/use-cases/reorder/generate-reorder-suggestions.use-case"
import { generateReorderSuggestions as generateReorderSuggestionsAction } from "@/app/actions/reorder"

export type ReorderSuggestion = ReorderSuggestionOutput

export async function generateReorderSuggestions(
  rules: ReorderRuleWithDetails[],
  pendingPOs: Array<{ items?: Array<{ material_type_id: string; quantity_sqft: number }> }> = []
): Promise<ReorderSuggestion[]> {
  return generateReorderSuggestionsAction({ rules, pendingPOs })
}

export function getStockStatus(current: number, reorderPoint: number, max: number) {
  const percentage = (current / max) * 100
  if (current <= reorderPoint) return { status: "low", color: "bg-red-500" }
  if (percentage < 50) return { status: "medium", color: "bg-yellow-500" }
  return { status: "ok", color: "bg-green-500" }
}
