import type {
  MaterialType,
  ReorderRuleWithDetails,
  Supplier,
} from "@/src/infrastructure/models/supabase"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { reorderRules as reorderRulesSdk } from "@/src/infrastructure/api-client/rf/procurement"
import { generateReorderSuggestions } from "@/app/actions/reorder"
import type { ReorderSuggestion } from "./reorder-suggestions"

interface FetchDataResult {
  reorderRules: ReorderRuleWithDetails[]
  materialTypes: MaterialType[]
  suppliers: Supplier[]
  suggestions: ReorderSuggestion[]
}

/**
 * Reorder dashboard data fetcher.
 *
 * `suggestions` is now produced by the server action — the action
 * fetches rules, attaches stock, fetches pending POs, and runs the
 * generate-suggestions use-case. The browser no longer composes a
 * suggestions payload, which closes the authoring gap that let
 * client-supplied `estimatedCost` reach a PO write (see
 * `app/actions/reorder.ts` "Authority model" docblock).
 *
 * `reorderRules` and the other lookups still come from the browser
 * because the dashboard's table/filter UI consumes them directly —
 * only the suggestion-generation step had a write-time authority gap.
 */
export async function fetchReorderData(): Promise<FetchDataResult> {
  const [rulesResponse, materials, suppliersData, suggestions] = await Promise.all([
    reorderRulesSdk.list() as unknown as Promise<ReorderRuleWithDetails[]>,
    materialTypeService.getAll(),
    supplierService.getActiveSuppliers(),
    generateReorderSuggestions(),
  ])

  return {
    reorderRules: rulesResponse ?? [],
    materialTypes: materials,
    suppliers: suppliersData,
    suggestions,
  }
}
