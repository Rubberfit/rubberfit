/**
 * @deprecated Legacy raw-row CRUD + analytics over `cuts`. Pre-DDD code
 * path retained so the dashboard summary cards, waste-comparison page,
 * reports generator, and notifications "recent activity" feed keep
 * type-checking against the imperial-typed `Cut` row shape.
 *
 * **The underlying schema (post-redesign) is mm/sqmm-native** —
 * `cut_width_mm`, `cut_length_mm`, `waste_sqmm`, `total_sqmm_used` —
 * and joined `rolls` columns are `material_type_id`, `width_mm`,
 * `thickness_mm`, `cost_per_sqm_cents`. The methods below still
 * reference the pre-redesign imperial column names (`waste_sqft`,
 * `total_sqft_used`, `cost_per_sqft`, `material_type`, etc.) and will
 * fail at runtime against the live DB. They stay broken until each
 * consumer page is rewritten against the entity-typed `cutService` +
 * `ICutsRepository` surface.
 *
 * **Use `cutService` (entity-typed) for new code.** This shim exists
 * only to unblock the cut service migration without rewriting every
 * dashboard / analytics / notifications surface in the same PR.
 * Follow-up migrations retire it page by page.
 */
import { supabase, type Cut } from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import "reflect-metadata"
import { injectable } from "tsyringe"
import { startOfWeek, endOfWeek, subWeeks } from "date-fns"

export interface WasteStats {
  averageWastePercentage: number
  totalWasteSqft: number
  totalMaterialUsed: number
}

export interface WasteTrend {
  period: string
  wastePercentage: number
}

export interface CutRollInfo {
  material_type: string
  location: string
  cost_per_sqft?: number
  width?: number
  thickness?: number
}

export interface CutWithRoll extends Cut {
  roll?: CutRollInfo
}

export interface OptimizeCutRequirements {
  materialType: string
  width: number
  length: number
  quantity: number
  thickness?: number
}

export interface OptimizeCutRecommendation {
  roll: unknown
  total_length_needed: number
  material_used_sqft: number
  waste_sqft: number
  waste_percentage: number
  remaining_length_after: number
  remaining_value_after: number
  score: number
}

export interface OptimizeCutResult {
  recommendations: OptimizeCutRecommendation[]
  message?: string
}

/** @deprecated See module-level docstring. */
@injectable()
export class LegacyCutService {
  async recordCut(cut: Omit<Cut, "id" | "user_id" | "created_at">): Promise<Cut> {
    const user_id = await getCurrentUserId()
    const { data, error } = await supabase
      .from("cuts")
      .insert([{ ...cut, user_id }])
      .select()
      .single()

    if (error) throw error
    return data as Cut
  }

  async getCutHistory(limit = 100): Promise<Cut[]> {
    const { data, error } = await supabase
      .from("cuts")
      .select(
        `
        *,
        roll:rolls(material_type, location)
      `
      )
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error
    return data as Cut[]
  }

  async getCutsByRoll(rollId: string): Promise<Cut[]> {
    const { data, error } = await supabase
      .from("cuts")
      .select("*")
      .eq("roll_id", rollId)
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as Cut[]
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
    return data as Cut[]
  }

  async getWasteStats(): Promise<WasteStats> {
    const { data, error } = await supabase
      .from("cuts")
      .select("waste_percentage, waste_sqft, total_sqft_used")
      .gte("created_at", new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString())

    if (error) throw error

    const stats: WasteStats = {
      averageWastePercentage: 0,
      totalWasteSqft: 0,
      totalMaterialUsed: 0,
    }

    if (data && data.length > 0) {
      stats.totalWasteSqft = data.reduce(
        (sum: number, cut: { waste_sqft?: number | null }) => sum + (cut.waste_sqft || 0),
        0
      )
      stats.totalMaterialUsed = data.reduce(
        (sum: number, cut: { total_sqft_used?: number | null }) => sum + (cut.total_sqft_used || 0),
        0
      )
      stats.averageWastePercentage =
        data.reduce(
          (sum: number, cut: { waste_percentage?: number | null }) =>
            sum + (cut.waste_percentage || 0),
          0
        ) / data.length
    }

    return stats
  }

  async optimizeCut(requirements: OptimizeCutRequirements): Promise<OptimizeCutResult> {
    let query = supabase
      .from("rolls")
      .select("*")
      .eq("status", "active")
      .eq("material_type", requirements.materialType)
      .gte("width", requirements.width)
      .gte("remaining_length", requirements.length * requirements.quantity)

    if (requirements.thickness) {
      query = query.gte("thickness", requirements.thickness)
    }

    const { data: eligibleRolls, error } = await query

    if (error) throw error
    if (!eligibleRolls || eligibleRolls.length === 0) {
      return { recommendations: [], message: "No suitable rolls found" }
    }

    interface EligibleRoll {
      width: number
      remaining_length: number
      cost_per_sqft?: number | null
      [key: string]: unknown
    }
    const recommendations = eligibleRolls.map((roll: EligibleRoll) => {
      const totalLengthNeeded = requirements.length * requirements.quantity
      const materialUsedSqft = (requirements.width * totalLengthNeeded) / 144
      const totalConsumedSqft = (roll.width * totalLengthNeeded) / 144
      const wasteSqft = totalConsumedSqft - materialUsedSqft
      const wastePercentage = totalConsumedSqft > 0 ? (wasteSqft / totalConsumedSqft) * 100 : 0
      const remainingAfter = roll.remaining_length - totalLengthNeeded

      return {
        roll,
        total_length_needed: totalLengthNeeded,
        material_used_sqft: materialUsedSqft,
        waste_sqft: wasteSqft,
        waste_percentage: wastePercentage,
        remaining_length_after: remainingAfter,
        remaining_value_after: (remainingAfter * roll.width * (roll.cost_per_sqft || 0)) / 144,
        score: wastePercentage,
      }
    })

    recommendations.sort((a: { score: number }, b: { score: number }) => a.score - b.score)

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
    return data as Cut[]
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
    return data as Cut[]
  }

  async getTotalMaterialUsedThisWeek(): Promise<number> {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const { data, error } = await supabase
      .from("cuts")
      .select("total_sqft_used")
      .gte("created_at", weekAgo.toISOString())

    if (error) throw error

    if (!data || data.length === 0) {
      return 0
    }

    return data.reduce(
      (sum: number, cut: { total_sqft_used?: number | null }) => sum + (cut.total_sqft_used || 0),
      0
    )
  }

  async getCutsGrowthPercentage(): Promise<number> {
    try {
      const now = new Date()
      const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 })
      const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 })
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
      const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })

      const { data: thisWeek, error: thisWeekError } = await supabase
        .from("cuts")
        .select("id")
        .gte("created_at", thisWeekStart.toISOString())
        .lte("created_at", thisWeekEnd.toISOString())

      if (thisWeekError) throw thisWeekError

      const { data: lastWeek, error: lastWeekError } = await supabase
        .from("cuts")
        .select("id")
        .gte("created_at", lastWeekStart.toISOString())
        .lte("created_at", lastWeekEnd.toISOString())

      if (lastWeekError) throw lastWeekError

      const thisWeekCount = thisWeek?.length || 0
      const lastWeekCount = lastWeek?.length || 0

      if (lastWeekCount === 0) {
        return thisWeekCount > 0 ? 100 : 0
      }

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
    return data as Cut[]
  }

  async getCutsByDateRangeWithRolls(
    from: Date,
    to?: Date,
    options?: { ascending?: boolean }
  ): Promise<CutWithRoll[]> {
    let query = supabase
      .from("cuts")
      .select("*, roll:rolls(material_type, location, cost_per_sqft, width, thickness)")
      .gte("created_at", from.toISOString())
      .order("created_at", { ascending: options?.ascending ?? false })

    if (to) {
      query = query.lte("created_at", to.toISOString())
    }

    const { data, error } = await query
    if (error) throw error
    return data as CutWithRoll[]
  }

  async getRecentCutsWithRolls(limit: number): Promise<CutWithRoll[]> {
    const { data, error } = await supabase
      .from("cuts")
      .select("*, roll:rolls(material_type, location)")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error
    return data as CutWithRoll[]
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
    return data as { waste_percentage: number }[]
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
          ? data.reduce(
              (sum: number, c: { waste_percentage?: number | null }) =>
                sum + (c.waste_percentage || 0),
              0
            ) / data.length
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
          ? thisMonth.reduce(
              (sum: number, cut: { waste_percentage?: number | null }) =>
                sum + (cut.waste_percentage || 0),
              0
            ) / thisMonth.length
          : 0

      const lastMonthAvg =
        lastMonth && lastMonth.length > 0
          ? lastMonth.reduce(
              (sum: number, cut: { waste_percentage?: number | null }) =>
                sum + (cut.waste_percentage || 0),
              0
            ) / lastMonth.length
          : 0

      if (lastMonthAvg === 0) {
        return 0
      }

      return ((thisMonthAvg - lastMonthAvg) / lastMonthAvg) * 100
    } catch (error) {
      console.error("Error getting waste improvement:", error)
      return 0
    }
  }
}

/** @deprecated See module-level docstring. */
export const legacyCutService = new LegacyCutService()
