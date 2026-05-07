import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import { taxService } from "@/src/infrastructure/services/taxService"
import { priceHistoryService } from "@/src/infrastructure/services/priceHistoryService"
import type {
  MaterialSupplierWithDetails,
  PurchaseOrder,
} from "@/src/infrastructure/models/supabase"
import type {
  ReorderSuggestion,
  OptimalOrderQuantity,
} from "@/src/application/services/reorder.service.interface"
import type { IReorderCalculationsService } from "@/src/application/services/reorder-calculations.service.interface"
import type { ITaxService } from "@/src/application/services/tax.service.interface"
import type { IPriceHistoryService } from "@/src/application/services/price-history.service.interface"
import { TOKENS } from "@/di/tokens"
import "reflect-metadata"
import { injectable, inject } from "tsyringe"

@injectable()
export class ReorderCalculationsService implements IReorderCalculationsService {
  constructor(
    @inject(TOKENS.ITaxService) private readonly taxService: ITaxService,
    @inject(TOKENS.IPriceHistoryService)
    private readonly priceHistoryService: IPriceHistoryService
  ) {}

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

  async createAutomaticPurchaseOrder(
    suggestion: ReorderSuggestion,
    getReorderRuleById: (id: string) => Promise<{ lead_time_days: number }>,
    generatePONumber: () => Promise<string>
  ): Promise<unknown> {
    try {
      if (!suggestion.supplierId) {
        throw new Error("Cannot create purchase order without supplier")
      }

      const poNumber = await generatePONumber()

      const orderDate = new Date().toISOString()
      const requestedDeliveryDate = new Date()

      let leadTimeDays = 7
      if (suggestion.reorderRuleId) {
        const rule = await getReorderRuleById(suggestion.reorderRuleId)
        leadTimeDays = rule.lead_time_days
      }

      requestedDeliveryDate.setDate(requestedDeliveryDate.getDate() + leadTimeDays)

      const supabase = await getDatabaseClient()
      const { data: material, error: matError } = await supabase
        .from("material_types")
        .select("*")
        .eq("id", suggestion.materialTypeId)
        .single()

      if (matError) throw matError

      const unitCost = suggestion.estimatedCost / suggestion.suggestedQuantity
      const subtotal = suggestion.estimatedCost
      const taxCalc = await this.taxService.calculatePurchaseOrderTax(
        suggestion.supplierId,
        subtotal
      )
      const taxAmount = taxCalc.taxAmount
      const totalAmount = subtotal + taxAmount

      const user_id = await getCurrentUserId()
      const { data: po, error: poError } = await supabase
        .from("purchase_orders")
        .insert([
          {
            user_id,
            po_number: poNumber,
            supplier_id: suggestion.supplierId,
            status: "draft",
            order_date: orderDate,
            requested_delivery_date: requestedDeliveryDate.toISOString(),
            subtotal,
            tax_amount: taxAmount,
            shipping_cost: 0,
            total_amount: totalAmount,
            auto_generated: true,
            reorder_rule_id: suggestion.reorderRuleId,
            notes: `Auto-generated PO: ${suggestion.reason}`,
          },
        ])
        .select()
        .single()

      if (poError) throw poError

      const { data: _poItem, error: itemError } = await supabase
        .from("purchase_order_items")
        .insert([
          {
            user_id,
            purchase_order_id: po.id,
            material_type_id: suggestion.materialTypeId,
            line_number: 1,
            description: material.name,
            quantity_sqft: suggestion.suggestedQuantity,
            unit_cost: unitCost,
            line_total: subtotal,
            quantity_received: 0,
          },
        ])
        .select()
        .single()

      if (itemError) throw itemError

      if (suggestion.reorderRuleId) {
        await supabase
          .from("reorder_rules")
          .update({ last_triggered_at: new Date().toISOString() })
          .eq("id", suggestion.reorderRuleId)
      }

      return po as PurchaseOrder
    } catch (error) {
      console.error("Error creating automatic purchase order:", error)
      throw error
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
            .sort(
              (a, b) =>
                this.priceHistoryService.calculateValueScore(b) -
                this.priceHistoryService.calculateValueScore(a)
            )[0]
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

export const reorderCalculations = new ReorderCalculationsService(taxService, priceHistoryService)
