import type { ReorderSuggestionOutput } from "@/src/application/use-cases/reorder/generate-reorder-suggestions.use-case"

/**
 * Re-export the use-case output type as the UI's `ReorderSuggestion`
 * shape. The actual generation now happens server-side via
 * `generateReorderSuggestions` in `@/app/actions/reorder` (called from
 * `reorder-data-fetcher.ts`); this module is just the type alias and
 * the row-level UI helper.
 */
export type ReorderSuggestion = ReorderSuggestionOutput

export function getStockStatus(current: number, reorderPoint: number, max: number) {
  const percentage = (current / max) * 100
  if (current <= reorderPoint) return { status: "low", color: "bg-red-500" }
  if (percentage < 50) return { status: "medium", color: "bg-yellow-500" }
  return { status: "ok", color: "bg-green-500" }
}
