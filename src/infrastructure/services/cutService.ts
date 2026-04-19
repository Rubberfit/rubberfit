import { supabase, type Cut } from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import type {
  ICutService,
  WasteStats,
  WasteTrend,
  CutWithRoll,
  OptimizeCutRequirements,
  OptimizeCutResult,
} from "@/src/application/services/cut.service.interface"
import "reflect-metadata"
import { injectable } from "tsyringe"

export type { WasteStats, WasteTrend, CutWithRoll, OptimizeCutRequirements, OptimizeCutResult }

@injectable()
export class CutService implements ICutService {
  async recordCut(cut: Omit<Cut, "id" | "user_id" | "created_at">): Promise<Cut> {
    const user_id = await getCurrentUserId()
    const { data, error } = await supabase
      .from("cuts")
      .insert([{ ...cut, user_id }])
      .select()
      .single()

    if (error) throw error

    // Roll remaining_length/status is maintained by the DB trigger
    // `cuts_update_roll` (see migration 20240217000006). Do not decrement here.

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
      stats.totalWasteSqft = data.reduce((sum: number, cut: Record<string, any>) => sum + (cut.waste_sqft || 0), 0)
      stats.totalMaterialUsed = data.reduce((sum: number, cut: Record<string, any>) => sum + (cut.total_sqft_used || 0), 0)
      stats.averageWastePercentage =
        data.reduce((sum: number, cut: Record<string, any>) => sum + (cut.waste_percentage || 0), 0) / data.length
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

    const recommendations = eligibleRolls.map((roll: Record<string, any>) => {
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

    return data.reduce((sum: number, cut: Record<string, any>) => sum + (cut.total_sqft_used || 0), 0)
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
          ? data.reduce((sum: number, c: Record<string, any>) => sum + (c.waste_percentage || 0), 0) / data.length
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
          ? thisMonth.reduce((sum: number, cut: Record<string, any>) => sum + (cut.waste_percentage || 0), 0) / thisMonth.length
          : 0

      const lastMonthAvg =
        lastMonth && lastMonth.length > 0
          ? lastMonth.reduce((sum: number, cut: Record<string, any>) => sum + (cut.waste_percentage || 0), 0) / lastMonth.length
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

export const cutService = new CutService()
