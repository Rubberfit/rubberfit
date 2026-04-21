import { supabase } from "@/src/infrastructure/models/supabase-context"
import type { MaterialType } from "@/src/entities"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import type { IMaterialTypeRepository } from "@/src/application/repositories/material_types.repository.interface"

export class MaterialTypeRepository implements IMaterialTypeRepository {
  async getAll(): Promise<MaterialType[]> {
    const { data, error } = await supabase
      .from("material_types")
      .select("*")
      .order("name", { ascending: true })

    if (error) throw error
    return data as MaterialType[]
  }

  async getByIds(ids: string[]): Promise<MaterialType[]> {
    if (ids.length === 0) return []
    const { data, error } = await supabase.from("material_types").select("*").in("id", ids)

    if (error) throw error
    return data as MaterialType[]
  }

  async getNames(): Promise<Pick<MaterialType, "id" | "name">[]> {
    const { data, error } = await supabase
      .from("material_types")
      .select("id, name")
      .order("name", { ascending: true })

    if (error) throw error
    return data as Pick<MaterialType, "id" | "name">[]
  }

  async getTopByCost(limit: number): Promise<MaterialType[]> {
    const { data, error } = await supabase
      .from("material_types")
      .select("*")
      .order("default_cost", { ascending: false })
      .limit(limit)

    if (error) throw error
    return data as MaterialType[]
  }

  async create(
    material: Omit<MaterialType, "id" | "user_id" | "created_at" | "updated_at">
  ): Promise<MaterialType> {
    const user_id = await getCurrentUserId()
    const { data, error } = await supabase
      .from("material_types")
      .insert([{ ...material, user_id }])
      .select()
      .single()

    if (error) throw error
    return data as MaterialType
  }

  async update(id: string, updates: Partial<MaterialType>): Promise<MaterialType> {
    const { data, error } = await supabase
      .from("material_types")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return data as MaterialType
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("material_types").delete().eq("id", id)

    if (error) throw error
  }
}

export const materialTypeRepository = new MaterialTypeRepository()
