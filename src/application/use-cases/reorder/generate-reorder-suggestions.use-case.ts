import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import type { ISupplierService } from "@/src/application/services/supplier.service.interface"
import type { MaterialType, ReorderRuleWithDetails } from "@/src/infrastructure/models/database.types"
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
  materials?: MaterialType[]
  pendingPOs?: Array<{
    items?: Array<{ material_type_id: string; quantity_sqft: number }>
  }>
}

export interface IGenerateReorderSuggestionsUseCase {
  execute(input: GenerateReorderSuggestionsInput): Promise<ReorderSuggestionOutput[]>
}

const DAILY_USAGE = 10
const ORDERING_COST = 50
const HOLDING_COST_RATE = 0.2

function computeUrgency(daysUntilStockout: number): ReorderSuggestionOutput["urgencyLevel"] {
  if (daysUntilStockout <= 2) return "critical"
  if (daysUntilStockout <= 5) return "high"
  if (daysUntilStockout <= 10) return "medium"
  return "low"
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
    @inject(TOKENS.ISupplierService) private readonly supplierService: ISupplierService
  ) {}

  async execute(input: GenerateReorderSuggestionsInput): Promise<ReorderSuggestionOutput[]> {
    const pendingQuantities = sumPendingQuantities(input.pendingPOs ?? [])
    const suggestions: ReorderSuggestionOutput[] = []

    for (const rule of input.rules) {
      const suggestion = await this.evaluateRule(rule, pendingQuantities)
      if (suggestion) suggestions.push(suggestion)
    }

    return suggestions.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
  }

  private async evaluateRule(
    rule: ReorderRuleWithDetails,
    pendingQuantities: Record<string, number>
  ): Promise<ReorderSuggestionOutput | null> {
    if (rule.current_stock == null || !rule.material_type) return null

    const currentStock = rule.current_stock
    const pendingQty = pendingQuantities[rule.material_type_id] || 0
    const reorderPoint = rule.reorder_point

    if (currentStock + pendingQty > reorderPoint) return null

    const daysUntilStockout = Math.max(0, Math.floor(currentStock / DAILY_USAGE))
    const annualDemand = DAILY_USAGE * 365
    const holdingCost = (rule.material_type.default_cost || 5) * HOLDING_COST_RATE
    const eoq = Math.sqrt((2 * annualDemand * ORDERING_COST) / holdingCost)
    const baseQuantity = Math.max(rule.reorder_quantity, Math.round(eoq))
    const suggestedQuantity = Math.max(0, baseQuantity - pendingQty)

    if (suggestedQuantity <= 0) return null

    const { supplierId, supplierName } = await this.resolveSupplier(rule)

    return {
      materialTypeId: rule.material_type_id,
      materialName: rule.material_type.name,
      currentStock,
      reorderPoint,
      suggestedQuantity,
      urgencyLevel: computeUrgency(daysUntilStockout),
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
