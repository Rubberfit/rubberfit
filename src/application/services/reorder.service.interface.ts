import type {
  CreateReorderRule,
  ReorderRuleWithDetails,
  UpdateReorderRule,
} from "@/src/infrastructure/models/supabase"

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

export interface OptimalOrderQuantity {
  quantity: number
  reasoning: string
  costSavings?: number
  bulkDiscountApplied: boolean
}

export interface IReorderService {
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
  checkReorderPoints(): Promise<ReorderSuggestion[]>
  generateReorderSuggestions(includeInactive?: boolean): Promise<ReorderSuggestion[]>
  createAutomaticPurchaseOrder(suggestion: ReorderSuggestion): Promise<unknown>
  calculateOptimalOrderQuantity(
    materialTypeId: string,
    supplierId?: string
  ): Promise<OptimalOrderQuantity>
  bulkUpdateReorderRules(
    updates: Array<{ id: string; updates: UpdateReorderRule }>
  ): Promise<ReorderRuleWithDetails[]>
  generatePONumber(): Promise<string>
  calculateCurrentStock(materialTypeId: string): Promise<number>
  calculateSuggestedQuantity(
    currentStock: number,
    reorderPoint: number,
    reorderQuantity: number,
    maxStock?: number
  ): number
  estimateReorderCost(
    materialTypeId: string,
    quantity: number,
    supplierId?: string
  ): Promise<number>
  determineUrgency(
    currentStock: number,
    reorderPoint: number,
    safetyStockDays: number
  ): "critical" | "high" | "normal" | "low"
  generateReorderReason(currentStock: number, reorderPoint: number): string
}
