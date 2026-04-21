import { supabase } from "@/src/infrastructure/models/supabase-context"
import type { CreateRoll, Roll, UpdateRoll } from "@/src/entities"
import type { IRollsRepository } from "@/src/application/repositories/rolls.repository.interface"
import {
  mapCreateRollToInsert,
  mapRowToRoll,
  mapUpdateRollToUpdate,
} from "@/src/infrastructure/mappers/rolls.mapper"

// TODO: resolve currency per-tenant via tenant_settings.default_currency or
// via a join on suppliers.currency. For now, all PricePerArea VOs on Roll
// are constructed in USD. Single-currency tenants are unaffected.
const DEFAULT_CURRENCY = "USD"

export class RollsRepository implements IRollsRepository {
  async getAllRolls(): Promise<Roll[]> {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map((row) => mapRowToRoll(row, DEFAULT_CURRENCY))
  }

  async getActiveRolls(): Promise<Roll[]> {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map((row) => mapRowToRoll(row, DEFAULT_CURRENCY))
  }

  async getRollById(id: string): Promise<Roll> {
    const { data, error } = await supabase.from("rolls").select("*").eq("id", id).single()
    if (error) throw error
    return mapRowToRoll(data, DEFAULT_CURRENCY)
  }

  async addRoll(input: CreateRoll): Promise<Roll> {
    const { data, error } = await supabase
      .from("rolls")
      .insert(mapCreateRollToInsert(input))
      .select()
      .single()
    if (error) throw error
    return mapRowToRoll(data, DEFAULT_CURRENCY)
  }

  async updateRoll(id: string, patch: UpdateRoll): Promise<Roll> {
    const { data, error } = await supabase
      .from("rolls")
      .update(mapUpdateRollToUpdate(patch))
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return mapRowToRoll(data, DEFAULT_CURRENCY)
  }

  async markAsDepleted(id: string): Promise<Roll> {
    const { data, error } = await supabase
      .from("rolls")
      .update({ status: "depleted" })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return mapRowToRoll(data, DEFAULT_CURRENCY)
  }

  async markRollDepleted(id: string): Promise<Roll> {
    const { data, error } = await supabase
      .from("rolls")
      .update({ status: "depleted", remaining_length_mm: 0 })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return mapRowToRoll(data, DEFAULT_CURRENCY)
  }

  async getInventoryValue(): Promise<number> {
    const { data, error } = await supabase
      .from("rolls")
      .select("width_mm, remaining_length_mm, cost_per_sqm_cents")
      .eq("status", "active")
      .is("deleted_at", null)
    if (error) throw error
    if (!data || data.length === 0) return 0
    return data.reduce((sum, row) => {
      const sqm = (row.width_mm * row.remaining_length_mm) / 1_000_000
      const cents = sqm * (row.cost_per_sqm_cents ?? 0)
      return sum + cents / 100
    }, 0)
  }

  async searchRolls(query: string): Promise<Roll[]> {
    const needle = `%${query}%`
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .or(`color.ilike.${needle},location.ilike.${needle},notes.ilike.${needle}`)
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map((row) => mapRowToRoll(row, DEFAULT_CURRENCY))
  }

  async getLowStockCount(): Promise<number> {
    try {
      const { data: materialTypes, error: mtError } = await supabase
        .from("material_types")
        .select("id, min_stock_sqm")
        .not("min_stock_sqm", "is", null)
      if (mtError) throw mtError
      if (!materialTypes || materialTypes.length === 0) return 0

      const { data: rolls, error: rollError } = await supabase
        .from("rolls")
        .select("material_type_id, width_mm, remaining_length_mm")
        .eq("status", "active")
        .is("deleted_at", null)
      if (rollError) throw rollError

      const stockSqmByMaterial = new Map<string, number>()
      rolls?.forEach((r) => {
        const sqm = (r.width_mm * r.remaining_length_mm) / 1_000_000
        stockSqmByMaterial.set(
          r.material_type_id,
          (stockSqmByMaterial.get(r.material_type_id) ?? 0) + sqm
        )
      })

      return materialTypes.reduce((count, mt) => {
        const current = stockSqmByMaterial.get(mt.id) ?? 0
        return current < (mt.min_stock_sqm ?? 0) ? count + 1 : count
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
    return (data ?? []).map((row) => mapRowToRoll(row, DEFAULT_CURRENCY))
  }

  async getRecentlyUpdatedRolls(limit: number): Promise<Roll[]> {
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map((row) => mapRowToRoll(row, DEFAULT_CURRENCY))
  }

  async existsByMaterialTypeId(materialTypeId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("rolls")
      .select("id")
      .eq("material_type_id", materialTypeId)
      .limit(1)
    if (error) throw error
    return (data?.length ?? 0) > 0
  }

  async getRollMaterialTypeMap(): Promise<Map<string, string>> {
    const { data, error } = await supabase.from("rolls").select("id, material_type_id")
    if (error) throw error
    const map = new Map<string, string>()
    data?.forEach((r) => map.set(r.id, r.material_type_id))
    return map
  }

  async bulkAddRolls(
    inputs: CreateRoll[],
    batchSize = 50
  ): Promise<{ imported: number; total: number }> {
    let imported = 0
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize).map(mapCreateRollToInsert)
      const { error } = await supabase.from("rolls").insert(batch)
      if (error) throw error
      imported += batch.length
    }
    return { imported, total: inputs.length }
  }

  async getInventoryGrowthPercentage(): Promise<number> {
    try {
      const { data, error } = await supabase
        .from("rolls")
        .select("created_at")
        .eq("status", "active")
        .is("deleted_at", null)
      if (error) throw error
      if (!data || data.length === 0) return 0
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const recent = data.filter((r) => new Date(r.created_at) > oneWeekAgo).length
      return (recent / data.length) * 100
    } catch (_error) {
      return 0
    }
  }

  async getThicknessesByMaterialTypeId(materialTypeId: string): Promise<number[]> {
    const { data, error } = await supabase
      .from("rolls")
      .select("thickness_mm")
      .eq("status", "active")
      .eq("material_type_id", materialTypeId)
    if (error) throw error
    const unique = new Set<number>()
    data?.forEach((r) => unique.add(r.thickness_mm))
    return [...unique].sort((a, b) => a - b)
  }
}

export const rollsRepository = new RollsRepository()
