import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"
import { taxService } from "@/src/infrastructure/services/taxService"
import type { MaterialSupplierWithDetails } from "@/src/infrastructure/models/supabase"
import type {
  IReorderCalculationsService,
  OptimalOrderQuantity,
} from "@/src/application/services/reorder-calculations.service.interface"
import type { ITaxService } from "@/src/application/services/tax.service.interface"
import { TOKENS } from "@/di/tokens"
import "reflect-metadata"
import { injectable, inject } from "tsyringe"

/**
 * Heuristic score combining price, lead time, rating, and preferred-supplier
 * bonus into a single "value" number for picking the best material_supplier
 * row. Previously lived on `priceHistoryService.calculateValueScore`; moved
 * here because (1) it's a pure formula with no DB I/O, (2) reorderCalculations
 * was the only caller, and (3) it reads the legacy `cost_per_sqft` /
 * `lead_time_days` shape so it's already coupled to the joined row, not the
 * `PriceHistory` entity surface.
 */
function calculateValueScore(supplier: MaterialSupplierWithDetails): number {
  const priceScore = 100 / (supplier.cost_per_sqft + 1)
  const leadTimeScore = 100 / ((supplier.lead_time_days || 1) + 1)
  const ratingScore = (supplier.supplier?.rating || 3) * 20
  const preferredBonus = supplier.preferred_supplier ? 20 : 0
  return priceScore + leadTimeScore + ratingScore + preferredBonus
}

@injectable()
export class ReorderCalculationsService implements IReorderCalculationsService {
  constructor(@inject(TOKENS.ITaxService) private readonly taxService: ITaxService) {}

  private generateOptimalQuantityReasoning(
    avgDailyUsage: number,
    optimalQuantity: number,
    bulkDiscountApplied: boolean
  ): string {
    const daysSupply = avgDailyUsage > 0 ? Math.round(optimalQuantity / avgDailyUsage) : 0

    let reasoning = `Based on average daily usage of ${avgDailyUsage.toFixed(1)} sq ft, `
    reasoning += `ordering ${optimalQuantity} sq ft provides approximately ${daysSupply} days of supply. `

    if (bulkDiscountApplied) {
      reasoning += "Bulk discount applied for quantity over 1000 sq ft."
    }

    return reasoning
  }

  async getAverageDailyUsage(): Promise<number> {
    try {
      const supabase = await getDatabaseClient()
      const { data: cuts, error: cutsError } = await supabase
        .from("cuts")
        .select("total_sqft_used, created_at")
        .gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())

      if (cutsError) throw cutsError

      const totalUsage =
        cuts?.reduce(
          (sum: number, cut: { total_sqft_used?: number | null }) =>
            sum + (cut.total_sqft_used || 0),
          0
        ) || 0
      return totalUsage / 90
    } catch (error) {
      console.error("Error calculating average daily usage:", error)
      return 0
    }
  }

  async calculateOptimalOrderQuantity(
    materialTypeId: string,
    supplierId?: string
  ): Promise<OptimalOrderQuantity> {
    try {
      const avgDailyUsage = await this.getAverageDailyUsage()

      const orderingCost = 50
      const holdingCostRate = 0.25
      let unitCost = 10

      if (supplierId) {
        const supabase = await getDatabaseClient()
        const { data: supplierInfo } = await supabase
          .from("material_suppliers")
          .select("cost_per_sqft, minimum_order_sqft")
          .eq("material_type_id", materialTypeId)
          .eq("supplier_id", supplierId)
          .single()

        if (supplierInfo) {
          unitCost = supplierInfo.cost_per_sqft
        }
      }

      const annualDemand = avgDailyUsage * 365
      const holdingCost = unitCost * holdingCostRate

      let eoq = 0
      if (annualDemand > 0 && holdingCost > 0) {
        eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost)
      }

      const optimalQuantity = Math.max(100, Math.round(eoq / 100) * 100)

      let bulkDiscountApplied = false
      let costSavings = 0

      if (optimalQuantity >= 1000) {
        bulkDiscountApplied = true
        costSavings = optimalQuantity * unitCost * 0.05
      }

      const reasoning = this.generateOptimalQuantityReasoning(
        avgDailyUsage,
        optimalQuantity,
        bulkDiscountApplied
      )

      return {
        quantity: optimalQuantity,
        reasoning,
        costSavings,
        bulkDiscountApplied,
      }
    } catch (error) {
      console.error("Error calculating optimal order quantity:", error)
      return {
        quantity: 500,
        reasoning: "Using default quantity due to insufficient data",
        bulkDiscountApplied: false,
      }
    }
  }

  async estimateReorderCost(
    materialTypeId: string,
    quantity: number,
    supplierId?: string
  ): Promise<number> {
    try {
      let costPerSqft = 10
      const supabase = await getDatabaseClient()

      if (supplierId) {
        const { data } = await supabase
          .from("material_suppliers")
          .select("cost_per_sqft")
          .eq("material_type_id", materialTypeId)
          .eq("supplier_id", supplierId)
          .single()

        if (data) {
          costPerSqft = data.cost_per_sqft
        }
      } else {
        const { data } = await supabase
          .from("material_suppliers")
          .select(
            `
            *,
            supplier:suppliers(id, name, rating, preferred)
          `
          )
          .eq("material_type_id", materialTypeId)
          .eq("active", true)

        const suppliers = (data ?? []) as MaterialSupplierWithDetails[]
        if (suppliers.length > 0) {
          const bestValue = suppliers
            .slice()
            .sort((a, b) => calculateValueScore(b) - calculateValueScore(a))[0]
          costPerSqft = bestValue.cost_per_sqft
        }
      }

      return quantity * costPerSqft
    } catch (error) {
      console.error("Error estimating reorder cost:", error)
      return quantity * 10
    }
  }

  async calculateCurrentStock(materialTypeId: string): Promise<number> {
    try {
      const supabase = await getDatabaseClient()
      const { data, error } = await supabase
        .from("rolls")
        .select("width, remaining_length")
        .eq("material_type_id", materialTypeId)
        .eq("status", "active")

      if (error) throw error

      if (!data || data.length === 0) return 0

      return data.reduce((total: number, roll: { width: number; remaining_length: number }) => {
        const sqft = (roll.width * roll.remaining_length) / 144
        return total + sqft
      }, 0)
    } catch (error) {
      console.error("Error calculating current stock:", error)
      return 0
    }
  }

  calculateSuggestedQuantity(
    currentStock: number,
    reorderPoint: number,
    reorderQuantity: number,
    maxStock?: number
  ): number {
    let suggested = reorderQuantity

    if (currentStock <= reorderPoint * 0.25) {
      suggested = reorderQuantity * 1.5
    }

    if (maxStock && currentStock + suggested > maxStock) {
      suggested = Math.max(0, maxStock - currentStock)
    }

    return Math.round(suggested / 10) * 10
  }

  determineUrgency(
    currentStock: number,
    reorderPoint: number,
    _safetyStockDays: number
  ): "critical" | "high" | "normal" | "low" {
    const stockRatio = currentStock / reorderPoint

    if (currentStock === 0) return "critical"
    if (stockRatio <= 0.25) return "high"
    if (stockRatio <= 0.5) return "normal"
    return "low"
  }

  generateReorderReason(currentStock: number, reorderPoint: number): string {
    const percentage = (((reorderPoint - currentStock) / reorderPoint) * 100).toFixed(1)

    if (currentStock === 0) {
      return "Out of stock - immediate reorder required"
    }
    if (currentStock < reorderPoint * 0.25) {
      return `Critically low stock - ${percentage}% below reorder point`
    }
    if (currentStock < reorderPoint * 0.5) {
      return `Low stock warning - ${percentage}% below reorder point`
    }
    return `Stock at reorder point (${currentStock.toFixed(0)} sq ft)`
  }
}

export const reorderCalculations = new ReorderCalculationsService(taxService)
