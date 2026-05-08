import type {
  MaterialType,
  ReorderRuleWithDetails,
  Supplier,
} from "@/src/infrastructure/models/supabase"
import { reorderService } from "@/src/infrastructure/services/reorderService"
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
 * `reorderRules` is still fetched (and enriched with `current_stock`)
 * here because the Reorder Rules tab's table renders per-rule stock
 * indicators (`reorder-rules-table.tsx::RuleRow` reads
 * `rule.current_stock` to draw the progress bar). Earlier rev of this
 * follow-up dropped that enrichment when moving the suggestion path
 * server-side; sigilix flagged the regression on PR #197 ("Reorder
 * rules no longer carry computed current_stock").
 */
export async function fetchReorderData(): Promise<FetchDataResult> {
  const [rulesResponse, materials, suppliersData, suggestions] = await Promise.all([
    reorderRulesSdk.list() as unknown as Promise<ReorderRuleWithDetails[]>,
    materialTypeService.getAll(),
    supplierService.getActiveSuppliers(),
    generateReorderSuggestions(),
  ])

  // Per-rule stock for the rules-table display. Independent of the
  // suggestion flow (which has its own server-side stock computation
  // inside the action).
  const rulesWithStock = rulesResponse
    ? await Promise.all(
        rulesResponse.map(async (rule) => ({
          ...rule,
          current_stock: await reorderService.calculateCurrentStock(rule.material_type_id),
        }))
      )
    : []

  return {
    reorderRules: rulesWithStock,
    materialTypes: materials,
    suppliers: suppliersData,
    suggestions,
  }
}
