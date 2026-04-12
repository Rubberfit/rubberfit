import type {
  CreateReorderRule,
  ReorderRuleWithDetails,
  UpdateReorderRule,
} from "@/src/infrastructure/models/supabase"

export interface ReorderSuggestion {
  materialTypeId: string
  materialTypeName: string
  supplierId?: string
  supplierName?: string
  currentStock: number
  reorderPoint: number
  suggestedQuantity: number
  estimatedCost: number
  urgency: "critical" | "high" | "normal" | "low"
  reason: string
  reorderRuleId: string
}

export interface OptimalOrderQuantity {
  materialTypeId: string
  optimalQuantity: number
  estimatedCost: number
  bulkDiscountApplied: boolean
  reasoning: string
}

export interface IReorderService {
  getAllReorderRules(): Promise<ReorderRuleWithDetails[]>
  getActiveReorderRules(): Promise<ReorderRuleWithDetails[]>
  getReorderRuleById(id: string): Promise<ReorderRuleWithDetails>
  getReorderRuleByMaterial(materialTypeId: string): Promise<ReorderRuleWithDetails | null>
  createReorderRule(rule: CreateReorderRule): Promise<ReorderRuleWithDetails>
  updateReorderRule(id: string, updates: UpdateReorderRule): Promise<ReorderRuleWithDetails>
  deleteReorderRule(id: string): Promise<boolean>
  checkReorderPoints(): Promise<ReorderSuggestion[]>
  generateReorderSuggestions(includeInactive?: boolean): Promise<ReorderSuggestion[]>
  createAutomaticPurchaseOrder(suggestion: ReorderSuggestion): Promise<unknown>
  calculateOptimalOrderQuantity(
    materialTypeId: string,
    supplierId?: string
  ): Promise<OptimalOrderQuantity>
}
