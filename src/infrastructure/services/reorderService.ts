import {
  type ReorderRuleWithDetails,
  type CreateReorderRule,
  type UpdateReorderRule,
} from "@/src/infrastructure/models/supabase"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import { reorderCalculations } from "./reorderCalculations"
import { generatePoNumber } from "./generatePoNumber"
import type {
  IReorderService,
  ReorderSuggestion,
  OptimalOrderQuantity,
} from "@/src/application/services/reorder.service.interface"
import type { IReorderCalculationsService } from "@/src/application/services/reorder-calculations.service.interface"
import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import { TOKENS } from "@/di/tokens"

export type { ReorderSuggestion, OptimalOrderQuantity }

@injectable()
export class ReorderService implements IReorderService {
  constructor(
    @inject(TOKENS.IReorderCalculationsService) private readonly calc: IReorderCalculationsService
  ) {}
  async getAllReorderRules(): Promise<ReorderRuleWithDetails[]> {
    try {
      const supabase = await getDatabaseClient()
      const { data, error } = await supabase
        .from("reorder_rules")
        .select(
          `
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `
        )
        .order("created_at", { ascending: false })

      if (error) throw error
      return data as ReorderRuleWithDetails[]
    } catch (error) {
      console.error("Error fetching reorder rules:", error)
      throw error
    }
  }

  async getActiveReorderRules(): Promise<ReorderRuleWithDetails[]> {
    try {
      const supabase = await getDatabaseClient()
      const { data, error } = await supabase
        .from("reorder_rules")
        .select(
          `
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `
        )
        .eq("active", true)
        .order("material_type_id", { ascending: true })

      if (error) throw error
      return data as ReorderRuleWithDetails[]
    } catch (error) {
      console.error("Error fetching active reorder rules:", error)
      throw error
    }
  }

  async getReorderRuleById(id: string): Promise<ReorderRuleWithDetails> {
    try {
      const supabase = await getDatabaseClient()
      const { data, error } = await supabase
        .from("reorder_rules")
        .select(
          `
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `
        )
        .eq("id", id)
        .single()

      if (error) throw error
      return data as ReorderRuleWithDetails
    } catch (error) {
      console.error("Error fetching reorder rule by ID:", error)
      throw error
    }
  }

  async getReorderRuleByMaterial(materialTypeId: string): Promise<ReorderRuleWithDetails | null> {
    try {
      const supabase = await getDatabaseClient()
      const { data, error } = await supabase
        .from("reorder_rules")
        .select(
          `
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `
        )
        .eq("material_type_id", materialTypeId)
        .eq("active", true)
        .single()

      if (error && error.code !== "PGRST116") throw error
      return data as ReorderRuleWithDetails | null
    } catch (error) {
      console.error("Error fetching reorder rule by material:", error)
      throw error
    }
  }

  async createReorderRule(
    rule: CreateReorderRule,
    userId?: string
  ): Promise<ReorderRuleWithDetails> {
    try {
      const supabase = await getDatabaseClient()
      // Server-action callers pass `userId = actor.id`; browser-side
      // legacy callers fall back to the deprecated `getCurrentUserId()`.
      // Mirrors the pattern already established by `updateReorderRule`.
      const user_id = userId ?? (await getCurrentUserId())
      const { data, error } = await supabase
        .from("reorder_rules")
        .insert([{ ...rule, user_id }])
        .select(
          `
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `
        )
        .single()

      if (error) throw error
      return data as ReorderRuleWithDetails
    } catch (error) {
      console.error("Error creating reorder rule:", error)
      throw error
    }
  }

  async updateReorderRule(
    id: string,
    updates: UpdateReorderRule,
    userId?: string
  ): Promise<ReorderRuleWithDetails> {
    try {
      const supabase = await getDatabaseClient()
      // Server-action callers pass `userId = actor.id`; browser-side
      // legacy callers fall back to the deprecated `getCurrentUserId()`.
      const user_id = userId ?? (await getCurrentUserId())
      const { data, error } = await supabase
        .from("reorder_rules")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user_id)
        .select(
          `
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `
        )
        .single()

      if (error) {
        console.error("Error updating reorder rule:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        })
        throw error
      }
      return data as ReorderRuleWithDetails
    } catch (error) {
      const err = error as Record<string, unknown>
      console.error("Error updating reorder rule:", {
        message: err?.message,
        code: err?.code,
        details: err?.details,
      })
      throw error
    }
  }

  async deleteReorderRule(id: string): Promise<boolean> {
    try {
      const supabase = await getDatabaseClient()
      const user_id = await getCurrentUserId()
      const { error } = await supabase
        .from("reorder_rules")
        .delete()
        .eq("id", id)
        .eq("user_id", user_id)

      if (error) {
        console.error("Error deleting reorder rule:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        })
        throw error
      }
      return true
    } catch (error) {
      const err = error as Record<string, unknown>
      console.error("Error deleting reorder rule:", {
        message: err?.message,
        code: err?.code,
        details: err?.details,
      })
      throw error
    }
  }

  async checkReorderPoints(): Promise<ReorderSuggestion[]> {
    try {
      const supabase = await getDatabaseClient()
      const { data: rules, error: rulesError } = await supabase
        .from("reorder_rules")
        .select(
          `
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `
        )
        .eq("active", true)

      if (rulesError) throw rulesError
      if (!rules || rules.length === 0) return []

      const suggestions: ReorderSuggestion[] = []

      for (const rule of rules) {
        const currentStock = await this.calc.calculateCurrentStock(rule.material_type_id)

        if (currentStock <= rule.reorder_point) {
          const suggestedQuantity = this.calc.calculateSuggestedQuantity(
            currentStock,
            rule.reorder_point,
            rule.reorder_quantity,
            rule.max_stock_level
          )

          const estimatedCost = await this.calc.estimateReorderCost(
            rule.material_type_id,
            suggestedQuantity,
            rule.supplier_id
          )

          const urgency = this.calc.determineUrgency(
            currentStock,
            rule.reorder_point,
            rule.safety_stock_days
          )

          suggestions.push({
            materialTypeId: rule.material_type_id,
            materialName: rule.material_type?.name || "Unknown",
            currentStock,
            reorderPoint: rule.reorder_point,
            suggestedQuantity,
            supplierId: rule.supplier_id,
            supplierName: rule.supplier?.name,
            estimatedCost,
            urgency,
            reason: this.calc.generateReorderReason(currentStock, rule.reorder_point),
            reorderRuleId: rule.id,
          })
        }
      }

      return suggestions.sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 }
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
      })
    } catch (error) {
      console.error("Error checking reorder points:", error)
      throw error
    }
  }

  async generateReorderSuggestions(includeInactive: boolean = false): Promise<ReorderSuggestion[]> {
    try {
      const supabase = await getDatabaseClient()
      const { data: materials, error: matError } = await supabase.from("material_types").select("*")

      if (matError) throw matError
      if (!materials || materials.length === 0) return []

      const suggestions: ReorderSuggestion[] = []

      for (const material of materials) {
        const currentStock = await this.calc.calculateCurrentStock(material.id)
        const rule = await this.getReorderRuleByMaterial(material.id)

        if (rule && rule.active) {
          if (currentStock <= rule.reorder_point) {
            const suggestedQuantity = this.calc.calculateSuggestedQuantity(
              currentStock,
              rule.reorder_point,
              rule.reorder_quantity,
              rule.max_stock_level
            )

            const estimatedCost = await this.calc.estimateReorderCost(
              material.id,
              suggestedQuantity,
              rule.supplier_id
            )

            suggestions.push({
              materialTypeId: material.id,
              materialName: material.name,
              currentStock,
              reorderPoint: rule.reorder_point,
              suggestedQuantity,
              supplierId: rule.supplier_id,
              supplierName: rule.supplier?.name,
              estimatedCost,
              urgency: this.calc.determineUrgency(
                currentStock,
                rule.reorder_point,
                rule.safety_stock_days
              ),
              reason: this.calc.generateReorderReason(currentStock, rule.reorder_point),
              reorderRuleId: rule.id,
            })
          }
        } else if (includeInactive && material.min_stock_alert) {
          if (currentStock <= material.min_stock_alert) {
            const suggestedQuantity = material.min_stock_alert * 2
            const estimatedCost = await this.calc.estimateReorderCost(
              material.id,
              suggestedQuantity,
              undefined
            )

            suggestions.push({
              materialTypeId: material.id,
              materialName: material.name,
              currentStock,
              reorderPoint: material.min_stock_alert,
              suggestedQuantity,
              estimatedCost,
              urgency: currentStock === 0 ? "critical" : "normal",
              reason: `Stock below minimum alert level (${material.min_stock_alert} sq ft)`,
            })
          }
        }
      }

      return suggestions.sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 }
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
      })
    } catch (error) {
      console.error("Error generating reorder suggestions:", error)
      throw error
    }
  }

  async createAutomaticPurchaseOrder(suggestion: ReorderSuggestion): Promise<unknown> {
    return this.calc.createAutomaticPurchaseOrder(
      suggestion,
      (id) => this.getReorderRuleById(id),
      () => this.generatePONumber()
    )
  }

  async calculateOptimalOrderQuantity(
    materialTypeId: string,
    supplierId?: string
  ): Promise<OptimalOrderQuantity> {
    return this.calc.calculateOptimalOrderQuantity(materialTypeId, supplierId)
  }

  async bulkUpdateReorderRules(
    updates: Array<{ id: string; updates: UpdateReorderRule }>
  ): Promise<ReorderRuleWithDetails[]> {
    try {
      const results = []

      for (const update of updates) {
        const result = await this.updateReorderRule(update.id, update.updates)
        results.push(result)
      }

      return results
    } catch (error) {
      console.error("Error bulk updating reorder rules:", error)
      throw error
    }
  }

  async generatePONumber(): Promise<string> {
    const supabase = await getDatabaseClient()
    const date = new Date()
    const year = date.getFullYear()

    const startOfYear = new Date(year, 0, 1).toISOString()
    const { count, error: _error } = await supabase
      .from("purchase_orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfYear)

    const sequence = (count || 0) + 1
    return generatePoNumber(year, sequence)
  }

  // Delegate helpers to reorderCalculations instance
  calculateCurrentStock(materialTypeId: string): Promise<number> {
    return this.calc.calculateCurrentStock(materialTypeId)
  }

  calculateSuggestedQuantity(
    currentStock: number,
    reorderPoint: number,
    reorderQuantity: number,
    maxStock?: number
  ): number {
    return this.calc.calculateSuggestedQuantity(
      currentStock,
      reorderPoint,
      reorderQuantity,
      maxStock
    )
  }

  estimateReorderCost(
    materialTypeId: string,
    quantity: number,
    supplierId?: string
  ): Promise<number> {
    return this.calc.estimateReorderCost(materialTypeId, quantity, supplierId)
  }

  determineUrgency(
    currentStock: number,
    reorderPoint: number,
    safetyStockDays: number
  ): "critical" | "high" | "normal" | "low" {
    return this.calc.determineUrgency(currentStock, reorderPoint, safetyStockDays)
  }

  generateReorderReason(currentStock: number, reorderPoint: number): string {
    return this.calc.generateReorderReason(currentStock, reorderPoint)
  }
}

export const reorderService = new ReorderService(reorderCalculations)
