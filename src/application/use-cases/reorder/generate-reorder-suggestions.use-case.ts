import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { IReorderCalculationsService } from "@/src/application/services/reorder-calculations.service.interface"
import type { ISupplierService } from "@/src/application/services/supplier.service.interface"
import type { ReorderRuleWithDetails } from "@/src/infrastructure/models/supabase"
import { TOKENS } from "@/di/tokens"

export interface ReorderSuggestionOutput {
  materialTypeId: string
  materialName: string
  currentStock: number
  reorderPoint: number
  suggestedQuantity: number
  urgencyLevel: "critical" | "high" | "medium" | "low"
  daysUntilStockout: number
  supplierId?: string
  supplierName?: string
  estimatedCost: number
  pendingQuantity?: number
}

export interface GenerateReorderSuggestionsInput {
  rules: ReorderRuleWithDetails[]
  pendingPOs?: Array<{
    items?: Array<{ material_type_id: string; quantity_sqft: number }>
  }>
}

export interface IGenerateReorderSuggestionsUseCase {
  execute(input: GenerateReorderSuggestionsInput): Promise<ReorderSuggestionOutput[]>
}

function mapUrgency(
  urgency: "critical" | "high" | "normal" | "low"
): ReorderSuggestionOutput["urgencyLevel"] {
  // The service uses "normal"; the UI layer expects "medium" for the mid tier.
  return urgency === "normal" ? "medium" : urgency
}

function sumPendingQuantities(
  pendingPOs: NonNullable<GenerateReorderSuggestionsInput["pendingPOs"]>
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const po of pendingPOs) {
    for (const item of po.items ?? []) {
      if (item.material_type_id) {
        totals[item.material_type_id] = (totals[item.material_type_id] || 0) + item.quantity_sqft
      }
    }
  }
  return totals
}

@injectable()
export class GenerateReorderSuggestionsUseCase implements IGenerateReorderSuggestionsUseCase {
  constructor(
    @inject(TOKENS.ISupplierService) private readonly supplierService: ISupplierService,
    @inject(TOKENS.IReorderCalculationsService)
    private readonly reorderCalculations: IReorderCalculationsService
  ) {}

  async execute(input: GenerateReorderSuggestionsInput): Promise<ReorderSuggestionOutput[]> {
    const pendingQuantities = sumPendingQuantities(input.pendingPOs ?? [])
    const avgDailyUsage = await this.reorderCalculations.getAverageDailyUsage()
    const suggestions: ReorderSuggestionOutput[] = []

    for (const rule of input.rules) {
      const suggestion = await this.evaluateRule(rule, pendingQuantities, avgDailyUsage)
      if (suggestion) suggestions.push(suggestion)
    }

    return suggestions.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
  }

  private async evaluateRule(
    rule: ReorderRuleWithDetails,
    pendingQuantities: Record<string, number>,
    avgDailyUsage: number
  ): Promise<ReorderSuggestionOutput | null> {
    if (rule.current_stock == null || !rule.material_type) return null

    const currentStock = rule.current_stock
    const pendingQty = pendingQuantities[rule.material_type_id] || 0
    const reorderPoint = rule.reorder_point

    if (currentStock + pendingQty > reorderPoint) return null

    const daysUntilStockout =
      avgDailyUsage > 0 ? Math.max(0, Math.floor(currentStock / avgDailyUsage)) : 0

    const optimal = await this.reorderCalculations.calculateOptimalOrderQuantity(
      rule.material_type_id,
      rule.supplier_id ?? undefined
    )
    const baseQuantity = Math.max(rule.reorder_quantity, optimal.quantity)
    const suggestedWithSafetyStock = this.reorderCalculations.calculateSuggestedQuantity(
      currentStock,
      reorderPoint,
      baseQuantity,
      rule.max_stock_level
    )
    const suggestedQuantity = Math.max(0, suggestedWithSafetyStock - pendingQty)

    if (suggestedQuantity <= 0) return null

    const { supplierId, supplierName } = await this.resolveSupplier(rule)

    const urgencyLevel = mapUrgency(
      this.reorderCalculations.determineUrgency(
        currentStock,
        reorderPoint,
        rule.safety_stock_days
      )
    )

    return {
      materialTypeId: rule.material_type_id,
      materialName: rule.material_type.name,
      currentStock,
      reorderPoint,
      suggestedQuantity,
      urgencyLevel,
      daysUntilStockout,
      supplierId,
      supplierName,
      estimatedCost: suggestedQuantity * (rule.material_type.default_cost || 5),
      pendingQuantity: pendingQty,
    }
  }

  private async resolveSupplier(
    rule: ReorderRuleWithDetails
  ): Promise<{ supplierId?: string; supplierName?: string }> {
    if (rule.supplier_id) {
      return { supplierId: rule.supplier_id, supplierName: rule.supplier?.name }
    }
    try {
      const preferred = await this.supplierService.getPreferredSupplierForMaterial(
        rule.material_type_id
      )
      if (preferred) {
        return { supplierId: preferred.supplier_id, supplierName: preferred.supplier?.name }
      }
    } catch (_error) {
      // Ignore — supplier just won't be set
    }
    return {}
  }
}
