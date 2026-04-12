import { supabase, type Cut } from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"

export const cutService = {
  // Record a new cut
  async recordCut(cut: Omit<Cut, "id" | "user_id" | "created_at">) {
    const user_id = await getCurrentUserId()
    const { data, error } = await supabase
      .from("cuts")
      .insert([{ ...cut, user_id }])
      .select()
      .single()

    if (error) throw error

    // Update the roll's remaining length
    if (cut.roll_id) {
      const { data: roll } = await supabase
        .from("rolls")
        .select("remaining_length")
        .eq("id", cut.roll_id)
        .single()

      if (roll) {
        const newLength = roll.remaining_length - cut.cut_length * cut.quantity
        await supabase
          .from("rolls")
          .update({
            remaining_length: Math.max(0, newLength),
            status: newLength <= 0 ? "depleted" : "active",
          })
          .eq("id", cut.roll_id)
      }
    }

    return data as Cut
  },

  // Get cut history
  async getCutHistory(limit = 100) {
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
    return data
  },

  // Get cuts for a specific roll
  async getCutsByRoll(rollId: string) {
    const { data, error } = await supabase
      .from("cuts")
      .select("*")
      .eq("roll_id", rollId)
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as Cut[]
  },

  // Get cuts this week
  async getCutsThisWeek() {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const { data, error } = await supabase
      .from("cuts")
      .select("*")
      .gte("created_at", weekAgo.toISOString())
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as Cut[]
  },

  // Get waste statistics
  async getWasteStats() {
    const { data, error } = await supabase
      .from("cuts")
      .select("waste_percentage, waste_sqft, total_sqft_used")
      .gte("created_at", new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString())

    if (error) throw error

    const stats = {
      averageWastePercentage: 0,
      totalWasteSqft: 0,
      totalMaterialUsed: 0,
    }

    if (data && data.length > 0) {
      stats.totalWasteSqft = data.reduce((sum, cut) => sum + (cut.waste_sqft || 0), 0)
      stats.totalMaterialUsed = data.reduce((sum, cut) => sum + (cut.total_sqft_used || 0), 0)
      stats.averageWastePercentage =
        data.reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) / data.length
    }

    return stats
  },

  // Optimize cut (find best roll)
  async optimizeCut(requirements: {
    materialType: string
    width: number
    length: number
    quantity: number
    thickness?: number
  }) {
    // Get eligible rolls
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

    // Calculate waste for each roll
    const recommendations = eligibleRolls.map((roll) => {
      const totalLengthNeeded = requirements.length * requirements.quantity
      const materialUsedSqft = (requirements.width * totalLengthNeeded) / 144
      const totalConsumedSqft = (roll.width * totalLengthNeeded) / 144
      const wasteSqft = totalConsumedSqft - materialUsedSqft
      // Fix: Add guard against division by zero
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
        score: wastePercentage, // Lower is better
      }
    })

    // Sort by lowest waste
    recommendations.sort((a, b) => a.score - b.score)

    return {
      recommendations: recommendations.slice(0, 3), // Top 3 options
      message: "Success",
    }
  },

  // Get all cuts
  async getAllCuts() {
    const { data, error } = await supabase
      .from("cuts")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as Cut[]
  },

  // Get cuts this month
  async getCutsThisMonth() {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from("cuts")
      .select("*")
      .gte("created_at", startOfMonth.toISOString())

    if (error) throw error
    return data as Cut[]
  },

  // Get total material used this week
  async getTotalMaterialUsedThisWeek() {
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

    return data.reduce((sum, cut) => sum + (cut.total_sqft_used || 0), 0)
  },

  // Get cuts growth percentage (compared to last week)
  async getCutsGrowthPercentage() {
    try {
      const now = new Date()
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

      // Get this week's cuts
      const { data: thisWeek, error: thisWeekError } = await supabase
        .from("cuts")
        .select("id")
        .gte("created_at", oneWeekAgo.toISOString())

      if (thisWeekError) throw thisWeekError

      // Get last week's cuts
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
  },

  // Get cuts by date range
  async getCutsByDateRange(from: Date, to: Date) {
    const { data, error } = await supabase
      .from("cuts")
      .select("*")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as Cut[]
  },

  // Get cuts by date range with roll join (material, location, cost info)
  async getCutsByDateRangeWithRolls(from: Date, to?: Date, options?: { ascending?: boolean }) {
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
    return data
  },

  // Get recent cuts with roll info
  async getRecentCutsWithRolls(limit: number) {
    const { data, error } = await supabase
      .from("cuts")
      .select("*, roll:rolls(material_type, location)")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error
    return data
  },

  // Get monthly waste percentages (for dashboard)
  async getMonthlyWastePercentages() {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from("cuts")
      .select("waste_percentage")
      .gte("created_at", startOfMonth.toISOString())

    if (error) throw error
    return data as { waste_percentage: number }[]
  },

  // Get waste trend by week (for dashboard chart)
  async getWasteTrendByWeek(weeks: number) {
    const now = new Date()
    const result: { period: string; wastePercentage: number }[] = []

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
          ? data.reduce((sum, c) => sum + (c.waste_percentage || 0), 0) / data.length
          : 0

      result.push({
        period: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        wastePercentage: Math.round(avg * 100) / 100,
      })
    }

    return result
  },

  // Get waste improvement percentage (compared to last month)
  async getWasteImprovementPercentage() {
    try {
      const now = new Date()
      // Fix: Create new date instances to avoid mutation
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())

      // Get this month's waste average
      const { data: thisMonth, error: thisMonthError } = await supabase
        .from("cuts")
        .select("waste_percentage")
        .gte("created_at", oneMonthAgo.toISOString())

      if (thisMonthError) throw thisMonthError

      // Get last month's waste average
      const { data: lastMonth, error: lastMonthError } = await supabase
        .from("cuts")
        .select("waste_percentage")
        .gte("created_at", twoMonthsAgo.toISOString())
        .lt("created_at", oneMonthAgo.toISOString())

      if (lastMonthError) throw lastMonthError

      const thisMonthAvg =
        thisMonth && thisMonth.length > 0
          ? thisMonth.reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) / thisMonth.length
          : 0

      const lastMonthAvg =
        lastMonth && lastMonth.length > 0
          ? lastMonth.reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) / lastMonth.length
          : 0

      if (lastMonthAvg === 0) {
        return 0
      }

      // Negative is improvement (less waste)
      return ((thisMonthAvg - lastMonthAvg) / lastMonthAvg) * 100
    } catch (error) {
      console.error("Error getting waste improvement:", error)
      return 0
    }
  },
}
