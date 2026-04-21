import { supabase } from "@/src/infrastructure/models/supabase-context"
import type { CreateCut, Cut } from "@/src/entities"
import {
  mapCreateCutToInsert,
  mapRowToCut,
} from "@/src/infrastructure/mappers/cuts.mapper"
import { mapRowToRoll } from "@/src/infrastructure/mappers/rolls.mapper"
import type {
  CutRollInfo,
  CutWithRoll,
  ICutService,
  OptimizeCutRecommendation,
  OptimizeCutRequirements,
  OptimizeCutResult,
  WasteStats,
  WasteTrend,
} from "@/src/application/services/cut.service.interface"
import "reflect-metadata"
import { injectable } from "tsyringe"

export type { CutRollInfo, CutWithRoll, OptimizeCutRequirements, OptimizeCutResult, WasteStats, WasteTrend }

// TODO: resolve tenant currency from session/tenant_settings.default_currency
const DEFAULT_CURRENCY = "USD"

// Shape returned by the nested join below (kept local — consumers get the
// mapped `CutWithRoll` shape).
interface CutWithRollRow {
  id: string
  tenant_id: string
  roll_id: string | null
  cut_width_mm: number
  cut_length_mm: number
  quantity: number
  waste_sqmm: number | null
  waste_percentage: number | null
  total_sqmm_used: number | null
  job_reference: string | null
  cut_by: string | null
  notes: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  deleted_at: string | null
  roll:
    | {
        location: string | null
        cost_per_sqm_cents: number | null
        width_mm: number
        thickness_mm: number
        material_type: { name: string } | null
      }
    | null
}

function attachRoll(row: CutWithRollRow): CutWithRoll {
  const cut = mapRowToCut(row)
  const roll: CutRollInfo | undefined = row.roll
    ? {
        materialTypeName: row.roll.material_type?.name ?? null,
        location: row.roll.location,
        costPerSqmCents: row.roll.cost_per_sqm_cents,
        widthMm: row.roll.width_mm,
        thicknessMm: row.roll.thickness_mm,
      }
    : undefined
  return { ...cut, roll }
}

@injectable()
export class CutService implements ICutService {
  async recordCut(input: CreateCut): Promise<Cut> {
    const { data, error } = await supabase
      .from("cuts")
      .insert(mapCreateCutToInsert(input))
      .select()
      .single()
    if (error) throw error
    return mapRowToCut(data)

    // NOTE: the roll length decrement and depletion status transition are
    // handled automatically by the trg_cuts_decrement_roll_and_notify
    // trigger (file 8). No manual UPDATE needed here.
  }

  async getCutHistory(limit = 100): Promise<Cut[]> {
    const { data, error } = await supabase
      .from("cuts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map(mapRowToCut)
  }

  async getCutsByRoll(rollId: string): Promise<Cut[]> {
    const { data, error } = await supabase
      .from("cuts")
      .select("*")
      .eq("roll_id", rollId)
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapRowToCut)
  }

  async getCutsThisWeek(): Promise<Cut[]> {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const { data, error } = await supabase
      .from("cuts")
      .select("*")
      .gte("created_at", weekAgo.toISOString())
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapRowToCut)
  }

  async getWasteStats(): Promise<WasteStats> {
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
    const { data, error } = await supabase
      .from("cuts")
      .select("waste_percentage, waste_sqmm, total_sqmm_used")
      .gte("created_at", oneMonthAgo.toISOString())
    if (error) throw error

    const stats: WasteStats = {
      averageWastePercentage: 0,
      totalWasteSqmm: 0,
      totalMaterialUsedSqmm: 0,
    }
    if (data && data.length > 0) {
      stats.totalWasteSqmm = data.reduce((sum, c) => sum + (c.waste_sqmm ?? 0), 0)
      stats.totalMaterialUsedSqmm = data.reduce(
        (sum, c) => sum + (c.total_sqmm_used ?? 0),
        0
      )
      stats.averageWastePercentage =
        data.reduce((sum, c) => sum + (c.waste_percentage ?? 0), 0) / data.length
    }
    return stats
  }

  async optimizeCut(requirements: OptimizeCutRequirements): Promise<OptimizeCutResult> {
    const totalLengthNeededMm = requirements.lengthMm * requirements.quantity
    let query = supabase
      .from("rolls")
      .select("*")
      .eq("status", "active")
      .is("deleted_at", null)
      .eq("material_type_id", requirements.materialTypeId)
      .gte("width_mm", requirements.widthMm)
      .gte("remaining_length_mm", totalLengthNeededMm)

    if (requirements.thicknessMm) {
      query = query.gte("thickness_mm", requirements.thicknessMm)
    }

    const { data: eligibleRolls, error } = await query
    if (error) throw error
    if (!eligibleRolls || eligibleRolls.length === 0) {
      return { recommendations: [], message: "No suitable rolls found" }
    }

    const recommendations: OptimizeCutRecommendation[] = eligibleRolls.map((row) => {
      const materialUsedSqmm = requirements.widthMm * totalLengthNeededMm
      const totalConsumedSqmm = row.width_mm * totalLengthNeededMm
      const wasteSqmm = totalConsumedSqmm - materialUsedSqmm
      const wastePercentage =
        totalConsumedSqmm > 0 ? (wasteSqmm / totalConsumedSqmm) * 100 : 0
      const remainingLengthAfterMm = row.remaining_length_mm - totalLengthNeededMm
      const remainingAreaSqm =
        (remainingLengthAfterMm * row.width_mm) / 1_000_000
      const remainingValueCents =
        remainingAreaSqm * (row.cost_per_sqm_cents ?? 0)

      return {
        roll: mapRowToRoll(row, DEFAULT_CURRENCY),
        totalLengthNeededMm,
        materialUsedSqmm,
        wasteSqmm,
        wastePercentage,
        remainingLengthAfterMm,
        remainingValueCents: Math.round(remainingValueCents),
        score: wastePercentage,
      }
    })

    recommendations.sort((a, b) => a.score - b.score)
    return {
      recommendations: recommendations.slice(0, 3),
      message: "Success",
    }
  }

  async getAllCuts(): Promise<Cut[]> {
    const { data, error } = await supabase
      .from("cuts")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapRowToCut)
  }

  async getCutsThisMonth(): Promise<Cut[]> {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const { data, error } = await supabase
      .from("cuts")
      .select("*")
      .gte("created_at", startOfMonth.toISOString())
    if (error) throw error
    return (data ?? []).map(mapRowToCut)
  }

  async getTotalMaterialUsedThisWeekSqmm(): Promise<number> {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const { data, error } = await supabase
      .from("cuts")
      .select("total_sqmm_used")
      .gte("created_at", weekAgo.toISOString())
    if (error) throw error
    if (!data || data.length === 0) return 0
    return data.reduce((sum, c) => sum + (c.total_sqmm_used ?? 0), 0)
  }

  async getCutsGrowthPercentage(): Promise<number> {
    try {
      const now = new Date()
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

      const { data: thisWeek, error: thisWeekError } = await supabase
        .from("cuts")
        .select("id")
        .gte("created_at", oneWeekAgo.toISOString())
      if (thisWeekError) throw thisWeekError

      const { data: lastWeek, error: lastWeekError } = await supabase
        .from("cuts")
        .select("id")
        .gte("created_at", twoWeeksAgo.toISOString())
        .lt("created_at", oneWeekAgo.toISOString())
      if (lastWeekError) throw lastWeekError

      const thisWeekCount = thisWeek?.length ?? 0
      const lastWeekCount = lastWeek?.length ?? 0
      if (lastWeekCount === 0) return thisWeekCount > 0 ? 100 : 0
      return ((thisWeekCount - lastWeekCount) / lastWeekCount) * 100
    } catch (error) {
      console.error("Error getting cuts growth:", error)
      return 0
    }
  }

  async getCutsByDateRange(from: Date, to: Date): Promise<Cut[]> {
    const { data, error } = await supabase
      .from("cuts")
      .select("*")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapRowToCut)
  }

  async getCutsByDateRangeWithRolls(
    from: Date,
    to?: Date,
    options?: { ascending?: boolean }
  ): Promise<CutWithRoll[]> {
    let query = supabase
      .from("cuts")
      .select(
        "*, roll:rolls(location, cost_per_sqm_cents, width_mm, thickness_mm, material_type:material_types(name))"
      )
      .gte("created_at", from.toISOString())
      .order("created_at", { ascending: options?.ascending ?? false })
    if (to) {
      query = query.lte("created_at", to.toISOString())
    }
    const { data, error } = await query
    if (error) throw error
    return ((data ?? []) as unknown as CutWithRollRow[]).map(attachRoll)
  }

  async getRecentCutsWithRolls(limit: number): Promise<CutWithRoll[]> {
    const { data, error } = await supabase
      .from("cuts")
      .select(
        "*, roll:rolls(location, cost_per_sqm_cents, width_mm, thickness_mm, material_type:material_types(name))"
      )
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) throw error
    return ((data ?? []) as unknown as CutWithRollRow[]).map(attachRoll)
  }

  async getMonthlyWastePercentages(): Promise<{ waste_percentage: number }[]> {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const { data, error } = await supabase
      .from("cuts")
      .select("waste_percentage")
      .gte("created_at", startOfMonth.toISOString())
    if (error) throw error
    return (data ?? []).map((d) => ({ waste_percentage: d.waste_percentage ?? 0 }))
  }

  async getWasteTrendByWeek(weeks: number): Promise<WasteTrend[]> {
    const now = new Date()
    const result: WasteTrend[] = []

    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7)
      const weekEnd = new Date(now)
      weekEnd.setDate(weekEnd.getDate() - i * 7)

      const { data, error } = await supabase
        .from("cuts")
        .select("waste_percentage")
        .gte("created_at", weekStart.toISOString())
        .lt("created_at", weekEnd.toISOString())
      if (error) throw error

      const avg =
        data && data.length > 0
          ? data.reduce((sum, c) => sum + (c.waste_percentage ?? 0), 0) / data.length
          : 0

      result.push({
        period: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        wastePercentage: Math.round(avg * 100) / 100,
      })
    }
    return result
  }

  async getWasteImprovementPercentage(): Promise<number> {
    try {
      const now = new Date()
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

      const { data: thisMonth, error: thisMonthError } = await supabase
        .from("cuts")
        .select("waste_percentage")
        .gte("created_at", oneMonthAgo.toISOString())
      if (thisMonthError) throw thisMonthError

      const { data: lastMonth, error: lastMonthError } = await supabase
        .from("cuts")
        .select("waste_percentage")
        .gte("created_at", twoMonthsAgo.toISOString())
        .lt("created_at", oneMonthAgo.toISOString())
      if (lastMonthError) throw lastMonthError

      const thisMonthAvg =
        thisMonth && thisMonth.length > 0
          ? thisMonth.reduce((sum, c) => sum + (c.waste_percentage ?? 0), 0) / thisMonth.length
          : 0
      const lastMonthAvg =
        lastMonth && lastMonth.length > 0
          ? lastMonth.reduce((sum, c) => sum + (c.waste_percentage ?? 0), 0) / lastMonth.length
          : 0

      if (lastMonthAvg === 0) return 0
      return ((thisMonthAvg - lastMonthAvg) / lastMonthAvg) * 100
    } catch (error) {
      console.error("Error getting waste improvement:", error)
      return 0
    }
  }
}

export const cutService = new CutService()
