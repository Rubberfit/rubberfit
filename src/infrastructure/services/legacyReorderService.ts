import "reflect-metadata"
import { injectable, inject } from "tsyringe"

import type {
  CreateReorderRule,
  ReorderRuleWithDetails,
  UpdateReorderRule,
} from "@/src/infrastructure/models/supabase"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import type {
  ILegacyReorderService,
  ReorderSuggestion,
} from "@/src/application/services/legacy-reorder.service.interface"
import type { IReorderCalculationsService } from "@/src/application/services/reorder-calculations.service.interface"
import { reorderCalculations } from "./reorderCalculations"
import { TOKENS } from "@/di/tokens"

export type { ReorderSuggestion }

/**
 * @deprecated Pre-DDD reorder surface — retained as a shim for the
 * inventory/reorder UI, RF api-client, and server actions. New code:
 * resolve `IReorderService` (entity-typed) and the
 * generate-reorder-suggestions use-case.
 *
 * Surviving methods (per migration scope on `feature/DDD-implementation`):
 * - rule CRUD: raw-row pass-throughs the UI still depends on
 * - `generateReorderSuggestions`: inline suggestion generation; the
 *   canonical path is `IGenerateReorderSuggestionsUseCase`.
 * - `calculateCurrentStock`: thin delegate to
 *   `IReorderCalculationsService` for the few sites that call it directly
 *
 * Dropped: `checkReorderPoints`, `createAutomaticPurchaseOrder`, four
 * other calc pass-throughs (`calculateSuggestedQuantity`,
 * `estimateReorderCost`, `determineUrgency`, `generateReorderReason`,
 * `calculateOptimalOrderQuantity`), and `generatePONumber` (the
 * canonical version lives on `purchaseOrderService`) — Codex-verified
 * unreachable from production.
 */
@injectable()
export class LegacyReorderService implements ILegacyReorderService {
  constructor(
    @inject(TOKENS.IReorderCalculationsService) private readonly calc: IReorderCalculationsService
  ) {}

  async getAllReorderRules(): Promise<ReorderRuleWithDetails[]> {
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
  }

  async getActiveReorderRules(): Promise<ReorderRuleWithDetails[]> {
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
  }

  async getReorderRuleById(id: string): Promise<ReorderRuleWithDetails> {
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
  }

  async getReorderRuleByMaterial(materialTypeId: string): Promise<ReorderRuleWithDetails | null> {
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
  }

  async createReorderRule(rule: CreateReorderRule): Promise<ReorderRuleWithDetails> {
    const supabase = await getDatabaseClient()
    const user_id = await getCurrentUserId()
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
  }

  async updateReorderRule(
    id: string,
    updates: UpdateReorderRule,
    userId?: string
  ): Promise<ReorderRuleWithDetails> {
    const supabase = await getDatabaseClient()
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

    if (error) throw error
    return data as ReorderRuleWithDetails
  }

  async deleteReorderRule(id: string): Promise<boolean> {
    const supabase = await getDatabaseClient()
    const user_id = await getCurrentUserId()
    const { error } = await supabase
      .from("reorder_rules")
      .delete()
      .eq("id", id)
      .eq("user_id", user_id)

    if (error) throw error
    return true
  }

  async bulkUpdateReorderRules(
    updates: Array<{ id: string; updates: UpdateReorderRule }>
  ): Promise<ReorderRuleWithDetails[]> {
    const results: ReorderRuleWithDetails[] = []
    for (const update of updates) {
      const result = await this.updateReorderRule(update.id, update.updates)
      results.push(result)
    }
    return results
  }

  async generateReorderSuggestions(includeInactive: boolean = false): Promise<ReorderSuggestion[]> {
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
  }

  calculateCurrentStock(materialTypeId: string): Promise<number> {
    return this.calc.calculateCurrentStock(materialTypeId)
  }
}

export const legacyReorderService: ILegacyReorderService = new LegacyReorderService(
  reorderCalculations
)
