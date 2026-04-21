import { supabase } from "@/src/infrastructure/models/supabase-context"
import type { Roll, MaterialType } from "@/src/entities"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import type { IRollsRepository } from "@/src/application/repositories/rolls.repository.interface"

export class RollsRepository implements IRollsRepository {
  async getAllRolls(): Promise<Roll[]> {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as Roll[]
  }

  async getActiveRolls(): Promise<Roll[]> {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .eq("status", "active")
      .order("material_type", { ascending: true })

    if (error) throw error
    return data as Roll[]
  }

  async getRollById(id: string): Promise<Roll> {
    const { data, error } = await supabase.from("rolls").select("*").eq("id", id).single()

    if (error) throw error
    return data as Roll
  }

  async addRoll(roll: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">): Promise<Roll> {
    const user_id = await getCurrentUserId()
    const { data, error } = await supabase
      .from("rolls")
      .insert([{ ...roll, user_id }])
      .select()
      .single()

    if (error) throw error
    return data as Roll
  }

  async updateRoll(id: string, updates: Partial<Roll>): Promise<Roll> {
    const { data, error } = await supabase
      .from("rolls")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return data as Roll
  }

  async markAsDepleted(id: string): Promise<Roll> {
    return this.updateRoll(id, { status: "depleted" })
  }

  async markRollDepleted(id: string): Promise<Roll> {
    const { data, error } = await supabase
      .from("rolls")
      .update({ status: "depleted", remaining_length: 0 })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return data as Roll
  }

  async getInventoryValue(): Promise<number> {
    const { data, error } = await supabase
      .from("rolls")
      .select("width, remaining_length, cost_per_sqft")
      .eq("status", "active")

    if (error) throw error
    if (!data || data.length === 0) return 0

    return data.reduce((sum, roll) => {
      const sqft = (roll.width * roll.remaining_length) / 144
      return sum + sqft * (roll.cost_per_sqft ?? 0)
    }, 0)
  }

  async searchRolls(query: string): Promise<Roll[]> {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .or(
        `material_type.ilike.%${query}%,color.ilike.%${query}%,location.ilike.%${query}%,supplier.ilike.%${query}%,notes.ilike.%${query}%`
      )
      .order("created_at", { ascending: false })

    if (error) throw error
    return data as Roll[]
  }

  async getLowStockCount(): Promise<number> {
    try {
      const { data: materialTypes, error: mtError } = await supabase
        .from("material_types")
        .select("name, min_stock_alert")

      if (mtError) throw mtError
      if (!materialTypes || materialTypes.length === 0) return 0

      const { data: rolls, error: rollError } = await supabase
        .from("rolls")
        .select("material_type, width, remaining_length")
        .eq("status", "active")

      if (rollError) throw rollError

      const stockLevels = new Map<string, number>()
      rolls?.forEach((roll) => {
        const sqft = (roll.width * roll.remaining_length) / 144
        const current = stockLevels.get(roll.material_type) ?? 0
        stockLevels.set(roll.material_type, current + sqft)
      })

      return materialTypes.reduce((count, mt) => {
        const currentStock = stockLevels.get(mt.name) ?? 0
        return currentStock < (mt.min_stock_alert ?? 0) ? count + 1 : count
      }, 0)
    } catch (_error) {
      return 0
    }
  }

  async deleteRoll(id: string): Promise<void> {
    const { error } = await supabase.from("rolls").delete().eq("id", id)

    if (error) throw error
  }

  async getRecentRolls(limit: number): Promise<Roll[]> {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error
    return data as Roll[]
  }

  async getRecentlyUpdatedRolls(limit: number): Promise<Roll[]> {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit)

    if (error) throw error
    return data as Roll[]
  }

  async existsByMaterialType(materialTypeName: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("rolls")
      .select("id")
      .eq("material_type", materialTypeName)
      .limit(1)

    if (error) throw error
    return (data?.length ?? 0) > 0
  }

  async getRollMaterialTypeMap(): Promise<Map<string, string>> {
    const { data, error } = await supabase.from("rolls").select("id, material_type")

    if (error) throw error
    const map = new Map<string, string>()
    data?.forEach((r) => map.set(r.id, r.material_type))
    return map
  }

  async bulkAddRolls(
    rolls: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">[],
    batchSize = 50
  ): Promise<{ imported: number; total: number }> {
    const user_id = await getCurrentUserId()
    let imported = 0

    for (let i = 0; i < rolls.length; i += batchSize) {
      const batch = rolls.slice(i, i + batchSize).map((roll) => ({ ...roll, user_id }))
      const { error } = await supabase.from("rolls").insert(batch)
      if (error) throw error
      imported += batch.length
    }

    return { imported, total: rolls.length }
  }

  async getInventoryGrowthPercentage(): Promise<number> {
    try {
      const { data, error } = await supabase
        .from("rolls")
        .select("created_at")
        .eq("status", "active")

      if (error) throw error
      if (!data || data.length === 0) return 0

      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const recentRolls = data.filter((roll) => new Date(roll.created_at) > oneWeekAgo).length

      return (recentRolls / data.length) * 100
    } catch (_error) {
      return 0
    }
  }

  async getThicknessesByMaterialType(materialType: string): Promise<number[]> {
    const { data, error } = await supabase
      .from("rolls")
      .select("thickness")
      .eq("status", "active")
      .eq("material_type", materialType)

    if (error) throw error
    return [...new Set(data?.map((r) => r.thickness))].sort((a, b) => a - b)
  }

  // Cross-domain convenience method — prefer materialTypeRepository.getAll() in new code
  async getMaterialTypes(): Promise<MaterialType[]> {
    const { data, error } = await supabase
      .from("material_types")
      .select("*")
      .order("name", { ascending: true })

    if (error) throw error
    return data as MaterialType[]
  }
}

export const rollsRepository = new RollsRepository()
