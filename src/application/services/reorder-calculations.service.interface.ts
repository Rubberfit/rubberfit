import type { ReorderSuggestion } from "@/src/application/services/legacy-reorder.service.interface"

export interface OptimalOrderQuantity {
  quantity: number
  reasoning: string
  costSavings?: number
  bulkDiscountApplied: boolean
}

export interface IReorderCalculationsService {
  getAverageDailyUsage(): Promise<number>
  calculateOptimalOrderQuantity(
    materialTypeId: string,
    supplierId?: string
  ): Promise<OptimalOrderQuantity>
  createAutomaticPurchaseOrder(
    suggestion: ReorderSuggestion,
    getReorderRuleById: (id: string) => Promise<{ lead_time_days: number }>,
    generatePONumber: () => Promise<string>
  ): Promise<unknown>
  estimateReorderCost(
    materialTypeId: string,
    quantity: number,
    supplierId?: string
  ): Promise<number>
  calculateCurrentStock(materialTypeId: string): Promise<number>
  calculateSuggestedQuantity(
    currentStock: number,
    reorderPoint: number,
    reorderQuantity: number,
    maxStock?: number
  ): number
  determineUrgency(
    currentStock: number,
    reorderPoint: number,
    safetyStockDays: number
  ): "critical" | "high" | "normal" | "low"
  generateReorderReason(currentStock: number, reorderPoint: number): string
}
