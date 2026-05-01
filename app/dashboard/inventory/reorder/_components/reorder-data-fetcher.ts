import type {
  MaterialType,
  ReorderRuleWithDetails,
  Supplier,
} from "@/src/infrastructure/models/supabase"
import { reorderService } from "@/src/infrastructure/services/reorderService"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import { materialTypeRepository } from "@/src/infrastructure/repositories/material-types.repository"
import { reorderRules as reorderRulesSdk } from "@/src/infrastructure/api-client/rf/procurement"
import { generateReorderSuggestions, type ReorderSuggestion } from "./reorder-suggestions"

interface FetchDataResult {
  reorderRules: ReorderRuleWithDetails[]
  materialTypes: MaterialType[]
  suppliers: Supplier[]
  suggestions: ReorderSuggestion[]
}

export async function fetchReorderData(): Promise<FetchDataResult> {
  // List via SDK — flag-ON hits Rust, flag-OFF uses legacy.
  // Stock calc stays on the legacy service for now; the Rust
  // path's per-rule `current_stock` surfaces through
  // `reorderRules.suggestions()` (see plan §"Reorder suggestion
  // contract"), which this UI will adopt post-S3c when the
  // table/card view is rewired to consume the suggestion DTO
  // directly instead of mounting `current_stock` on each rule.
  const rulesResponse = (await reorderRulesSdk.list()) as unknown as ReorderRuleWithDetails[]
  let rulesWithStock: (ReorderRuleWithDetails & {
    current_stock: number
    stock_status: "ok"
  })[] = []

  if (rulesResponse) {
    rulesWithStock = await Promise.all(
      rulesResponse.map(async (rule) => {
        const currentStock = await reorderService.calculateCurrentStock(rule.material_type_id)
        return {
          ...rule,
          current_stock: currentStock,
          stock_status: "ok" as const,
        }
      })
    )
  }

  const [materials, suppliersData, pendingPOs] = await Promise.all([
    materialTypeRepository.getAll(),
    supplierService.getActiveSuppliers(),
    purchaseOrderService.getPurchaseOrdersByStatuses(["draft", "pending", "approved", "ordered"]),
  ])

  let suggestions: ReorderSuggestion[] = []
  if (rulesWithStock.length > 0) {
    suggestions = await generateReorderSuggestions(
      rulesWithStock as ReorderRuleWithDetails[],
      pendingPOs
    )
  }

  return {
    reorderRules: rulesWithStock as ReorderRuleWithDetails[],
    materialTypes: materials,
    suppliers: suppliersData,
    suggestions,
  }
}
