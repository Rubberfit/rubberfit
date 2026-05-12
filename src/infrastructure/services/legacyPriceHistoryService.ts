/**
 * @deprecated Legacy raw-row writer + analytics over the
 * `material_suppliers` + `price_history` tables. Pre-DDD code path
 * retained so the pricing dashboard, reorder calculations, and the
 * material-supplier link flow keep type-checking. The underlying
 * schema (post-redesign) no longer has the `cost_per_sqft` /
 * `minimum_order_sqft` columns this surface references, so analytics
 * methods will fail at runtime against the live DB.
 *
 * **Use `priceHistoryService` (entity-typed) for new code.** This shim
 * exists only to unblock the price-history service migration without
 * rewriting the pricing dashboard in the same PR.
 */
import "reflect-metadata"
import { injectable } from "tsyringe"

import type {
  BestPriceOption,
  ILegacyPriceHistoryService,
  PriceBulkChange,
  PriceComparison,
  PriceTrend,
} from "@/src/application/services/price-history.service.interface"
import {
  supabase,
  type MaterialSupplierWithDetails,
  type PriceHistory,
} from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"

@injectable()
export class LegacyPriceHistoryService implements ILegacyPriceHistoryService {
  async trackPriceChange(
    materialSupplierId: string,
    oldPrice: number | undefined,
    newPrice: number,
    changeReason?: string,
    changedBy?: string
  ): Promise<PriceHistory> {
    const priceChangePercentage =
      oldPrice !== undefined ? ((newPrice - oldPrice) / oldPrice) * 100 : undefined

    const user_id = await getCurrentUserId()
    const { data, error } = await supabase
      .from("price_history")
      .insert([
        {
          user_id,
          material_supplier_id: materialSupplierId,
          old_cost_per_sqft: oldPrice,
          new_cost_per_sqft: newPrice,
          price_change_percentage: priceChangePercentage,
          change_reason: changeReason,
          effective_date: new Date().toISOString(),
          changed_by: changedBy,
        },
      ])
      .select()
      .single()

    if (error) throw error
    return data as PriceHistory
  }

  async comparePrices(materialTypeId: string): Promise<PriceComparison> {
    const { data, error } = await supabase
      .from("material_suppliers")
      .select(
        `
        *,
        supplier:suppliers(id, name, rating, preferred)
      `
      )
      .eq("material_type_id", materialTypeId)
      .eq("active", true)
      .order("cost_per_sqft", { ascending: true })

    if (error) throw error
    const suppliers = data as MaterialSupplierWithDetails[]
    if (suppliers.length === 0) {
      return {
        suppliers: [],
        lowestPrice: 0,
        highestPrice: 0,
        averagePrice: 0,
        priceRange: 0,
        bestValue: null,
      }
    }

    const prices = suppliers.map((s) => s.cost_per_sqft)
    const lowestPrice = Math.min(...prices)
    const highestPrice = Math.max(...prices)
    const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length

    const bestValue = suppliers.reduce((best, current) => {
      const currentScore = this.calculateValueScore(current)
      const bestScore = best ? this.calculateValueScore(best) : 0
      return currentScore > bestScore ? current : best
    }, suppliers[0])

    return {
      suppliers,
      lowestPrice,
      highestPrice,
      averagePrice,
      priceRange: highestPrice - lowestPrice,
      bestValue,
    }
  }

  async calculatePriceTrends(materialTypeId: string, daysBack: number = 30): Promise<PriceTrend[]> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    const { data: currentPrices, error: cpError } = await supabase
      .from("material_suppliers")
      .select(
        `
        *,
        supplier:suppliers(id, name)
      `
      )
      .eq("material_type_id", materialTypeId)
      .eq("active", true)

    if (cpError) throw cpError
    if (!currentPrices || currentPrices.length === 0) return []

    const trends: PriceTrend[] = []
    for (const ms of currentPrices) {
      const { data: history, error: histError } = await supabase
        .from("price_history")
        .select("*")
        .eq("material_supplier_id", ms.id)
        .gte("effective_date", startDate.toISOString())
        .order("effective_date", { ascending: false })
      if (histError) throw histError

      const currentPrice = ms.cost_per_sqft
      const previousPrice =
        history && history.length > 0 && history[0].old_cost_per_sqft
          ? history[0].old_cost_per_sqft
          : currentPrice
      const changeAmount = currentPrice - previousPrice
      const changePercentage = previousPrice !== 0 ? (changeAmount / previousPrice) * 100 : 0

      let trend: "increasing" | "decreasing" | "stable"
      if (Math.abs(changePercentage) < 1) trend = "stable"
      else if (changePercentage > 0) trend = "increasing"
      else trend = "decreasing"

      trends.push({
        materialTypeId,
        supplierId: ms.supplier_id,
        currentPrice,
        previousPrice,
        changeAmount,
        changePercentage,
        trend,
        priceHistory: history || [],
      })
    }
    return trends
  }

  async getBestPrice(materialTypeId: string): Promise<BestPriceOption | null> {
    const { data, error } = await supabase
      .from("material_suppliers")
      .select(
        `
        *,
        supplier:suppliers(id, name, rating, preferred)
      `
      )
      .eq("material_type_id", materialTypeId)
      .eq("active", true)
      .order("cost_per_sqft", { ascending: true })
      .limit(1)
      .single()
    if (error && error.code !== "PGRST116") throw error
    if (!data) return null

    const { data: lastChange } = await supabase
      .from("price_history")
      .select("effective_date, price_change_percentage")
      .eq("material_supplier_id", data.id)
      .order("effective_date", { ascending: false })
      .limit(1)
      .single()

    return {
      supplierId: data.supplier_id,
      supplierName: data.supplier?.name || "",
      materialSupplierId: data.id,
      costPerSqft: data.cost_per_sqft,
      leadTimeDays: data.lead_time_days || 0,
      minimumOrderSqft: data.minimum_order_sqft || 0,
      isPreferred: data.preferred_supplier,
      lastPriceChange: lastChange
        ? {
            date: lastChange.effective_date,
            changePercentage: lastChange.price_change_percentage || 0,
          }
        : undefined,
    }
  }

  async bulkTrackPriceChanges(changes: PriceBulkChange[]): Promise<PriceHistory[]> {
    const user_id = await getCurrentUserId()
    const records = changes.map((change) => ({
      user_id,
      material_supplier_id: change.materialSupplierId,
      old_cost_per_sqft: change.oldPrice,
      new_cost_per_sqft: change.newPrice,
      price_change_percentage:
        change.oldPrice !== undefined
          ? ((change.newPrice - change.oldPrice) / change.oldPrice) * 100
          : undefined,
      change_reason: change.changeReason,
      effective_date: new Date().toISOString(),
      changed_by: change.changedBy,
    }))

    const { data, error } = await supabase.from("price_history").insert(records).select()
    if (error) throw error
    return data as PriceHistory[]
  }

  calculateValueScore(supplier: MaterialSupplierWithDetails): number {
    const priceScore = 100 / (supplier.cost_per_sqft + 1)
    const leadTimeScore = 100 / ((supplier.lead_time_days || 1) + 1)
    const ratingScore = (supplier.supplier?.rating || 3) * 20
    const preferredBonus = supplier.preferred_supplier ? 20 : 0
    return priceScore + leadTimeScore + ratingScore + preferredBonus
  }
}

export const legacyPriceHistoryService: ILegacyPriceHistoryService = new LegacyPriceHistoryService()
