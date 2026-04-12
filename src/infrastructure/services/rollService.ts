import { supabase, type Roll, type MaterialType } from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"

export const rollService = {
  // Fetch all rolls
  async getAllRolls() {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as Roll[]
  },

  // Fetch active rolls only
  async getActiveRolls() {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .eq("status", "active")
      .order("material_type", { ascending: true })

    if (error) throw error
    return data as Roll[]
  },

  // Get roll by ID
  async getRollById(id: string) {
    const { data, error } = await supabase.from("rolls").select("*").eq("id", id).single()

    if (error) throw error
    return data as Roll
  },

  // Add new roll
  async addRoll(roll: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">) {
    const user_id = await getCurrentUserId()
    const { data, error } = await supabase
      .from("rolls")
      .insert([{ ...roll, user_id }])
      .select()
      .single()

    if (error) throw error
    return data as Roll
  },

  // Update roll
  async updateRoll(id: string, updates: Partial<Roll>) {
    const { data, error } = await supabase
      .from("rolls")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return data as Roll
  },

  // Mark roll as depleted
  async markAsDepleted(id: string) {
    return this.updateRoll(id, { status: "depleted" })
  },

  // Get inventory value
  async getInventoryValue() {
    const { data, error } = await supabase
      .from("rolls")
      .select("width, remaining_length, cost_per_sqft")
      .eq("status", "active")

    if (error) throw error

    if (!data || data.length === 0) {
      return 0
    }

    const totalValue = data.reduce((sum, roll) => {
      const sqft = (roll.width * roll.remaining_length) / 144
      return sum + sqft * (roll.cost_per_sqft || 0)
    }, 0)

    return totalValue
  },

  // Get material types
  async getMaterialTypes() {
    const { data, error } = await supabase
      .from("material_types")
      .select("*")
      .order("name", { ascending: true })

    if (error) throw error
    return data as MaterialType[]
  },

  // Search rolls
  async searchRolls(query: string) {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .or(
        `material_type.ilike.%${query}%,color.ilike.%${query}%,location.ilike.%${query}%,supplier.ilike.%${query}%,notes.ilike.%${query}%`
      )
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as Roll[]
  },

  // Get low stock count
  async getLowStockCount() {
    try {
      // Get material types with their thresholds
      const { data: materialTypes, error: mtError } = await supabase
        .from("material_types")
        .select("name, min_stock_alert")

      if (mtError) throw mtError

      if (!materialTypes || materialTypes.length === 0) {
        return 0
      }

      // Get active rolls grouped by material type
      const { data: rolls, error: rollError } = await supabase
        .from("rolls")
        .select("material_type, width, remaining_length")
        .eq("status", "active")

      if (rollError) throw rollError

      // Calculate stock levels by material type
      const stockLevels = new Map<string, number>()

      if (rolls) {
        rolls.forEach((roll) => {
          const sqft = (roll.width * roll.remaining_length) / 144
          const current = stockLevels.get(roll.material_type) || 0
          stockLevels.set(roll.material_type, current + sqft)
        })
      }

      // Count materials below threshold
      let lowStockCount = 0
      materialTypes.forEach((mt) => {
        const currentStock = stockLevels.get(mt.name) || 0
        if (currentStock < (mt.min_stock_alert || 0)) {
          lowStockCount++
        }
      })

      return lowStockCount
    } catch (error) {
      console.error("Error getting low stock count:", error)
      return 0
    }
  },

  // Delete a roll
  async deleteRoll(id: string) {
    const { error } = await supabase.from("rolls").delete().eq("id", id)

    if (error) throw error
  },

  // Get recent rolls (newest first)
  async getRecentRolls(limit: number) {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error
    return data as Roll[]
  },

  // Get recently updated rolls
  async getRecentlyUpdatedRolls(limit: number) {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit)

    if (error) throw error
    return data as Roll[]
  },

  // Check if any rolls use a specific material type name
  async existsByMaterialType(materialTypeName: string) {
    const { data, error } = await supabase
      .from("rolls")
      .select("id")
      .eq("material_type", materialTypeName)
      .limit(1)

    if (error) throw error
    return (data?.length ?? 0) > 0
  },

  // Get roll_id to material_type mapping
  async getRollMaterialTypeMap() {
    const { data, error } = await supabase.from("rolls").select("id, material_type")

    if (error) throw error
    const map = new Map<string, string>()
    data?.forEach((r) => map.set(r.id, r.material_type))
    return map
  },

  // Mark roll as depleted (sets status and remaining_length)
  async markRollDepleted(id: string) {
    const { data, error } = await supabase
      .from("rolls")
      .update({ status: "depleted", remaining_length: 0 })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return data as Roll
  },

  // Bulk add rolls (for CSV import)
  async bulkAddRolls(
    rolls: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">[],
    batchSize = 50
  ): Promise<{ imported: number; total: number }> {
    const user_id = await getCurrentUserId()
    let imported = 0

    for (let i = 0; i < rolls.length; i += batchSize) {
      const batch = rolls.slice(i, i + batchSize).map((roll) => ({
        ...roll,
        user_id,
      }))

      const { error } = await supabase.from("rolls").insert(batch)

      if (error) throw error
      imported += batch.length
    }

    return { imported, total: rolls.length }
  },

  // Get inventory growth percentage (compared to last week)
  async getInventoryGrowthPercentage() {
    try {
      const { data, error } = await supabase
        .from("rolls")
        .select("created_at")
        .eq("status", "active")

      if (error) throw error

      if (!data || data.length === 0) {
        return 0
      }

      const now = new Date()
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const recentRolls = data.filter((roll) => new Date(roll.created_at) > oneWeekAgo).length

      const totalRolls = data.length

      if (totalRolls === 0) return 0

      // Calculate percentage of recent additions
      return (recentRolls / totalRolls) * 100
    } catch (error) {
      console.error("Error getting inventory growth:", error)
      return 0
    }
  },

  // Get distinct thicknesses for a material type (active rolls only)
  async getThicknessesByMaterialType(materialType: string) {
    const { data, error } = await supabase
      .from("rolls")
      .select("thickness")
      .eq("status", "active")
      .eq("material_type", materialType)

    if (error) throw error

    const unique = [...new Set(data?.map((r) => r.thickness))].sort((a, b) => a - b)
    return unique
  },
}
