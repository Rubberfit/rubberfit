import type {
  MaterialType,
  ReorderRuleWithDetails,
  Supplier,
} from "@/src/infrastructure/models/supabase"
import { reorderService } from "@/src/infrastructure/services/reorderService"
import { legacySupplierService as supplierService } from "@/src/infrastructure/services/legacySupplierService"
import { legacyMaterialTypeService as materialTypeService } from "@/src/infrastructure/services/legacyMaterialTypeService"
import { reorderRules as reorderRulesSdk } from "@/src/infrastructure/api-client/rf/procurement"
import { generateReorderSuggestions } from "@/app/actions/reorder"
// `ReorderSuggestionOutput` lives on the use-case (the canonical
// source). The fetcher imports from the application layer instead
// of the UI module — coderabbit flagged on PR #197 that pulling the
// data-contract type out of `./reorder-suggestions` (a UI file with
// `getStockStatus` and JSX-adjacent helpers) inverts the dependency
// direction. Now `reorder-suggestions.ts`'s own `ReorderSuggestion`
// alias is just a UI-side convenience that re-exports the same type.
import type { ReorderSuggestionOutput } from "@/src/application/use-cases/reorder/generate-reorder-suggestions.use-case"

interface FetchDataResult {
  reorderRules: ReorderRuleWithDetails[]
  materialTypes: MaterialType[]
  suppliers: Supplier[]
  suggestions: ReorderSuggestionOutput[]
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
 *
 * **Failure isolation.** The four upstream calls run in parallel via
 * `Promise.all`, but `generateReorderSuggestions()` is wrapped so its
 * rejection produces an empty `suggestions` array instead of bringing
 * down the whole payload. The Rules / Suppliers / Material Types tabs
 * are independent surfaces — a transient failure in the suggestion
 * pipeline (use-case throw, RBAC failure on a stale session, supplier
 * lookup hiccup) shouldn't blank them. Coderabbit flagged this as a
 * Major issue on PR #197.
 */
export async function fetchReorderData(): Promise<FetchDataResult> {
  const [rulesResponse, materials, suppliersData, suggestions] = await Promise.all([
    reorderRulesSdk.list() as unknown as Promise<ReorderRuleWithDetails[]>,
    materialTypeService.getAll(),
    supplierService.getActiveSuppliers(),
    generateReorderSuggestions().catch((error) => {
      console.error("[reorder] generateReorderSuggestions failed; degrading to []:", error)
      return [] as ReorderSuggestionOutput[]
    }),
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
