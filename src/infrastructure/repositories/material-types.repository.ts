import { supabase } from "@/src/infrastructure/models/supabase-context"
import type { CreateMaterialType, MaterialType, UpdateMaterialType } from "@/src/entities"
import type { IMaterialTypeRepository } from "@/src/application/repositories/material_types.repository.interface"
import {
  mapCreateMaterialTypeToInsert,
  mapRowToMaterialType,
  mapUpdateMaterialTypeToUpdate,
} from "@/src/infrastructure/mappers/material-types.mapper"

export class MaterialTypeRepository implements IMaterialTypeRepository {
  async getAll(): Promise<MaterialType[]> {
    const { data, error } = await supabase
      .from("material_types")
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true })
    if (error) throw error
    return (data ?? []).map(mapRowToMaterialType)
  }

  async getByIds(ids: string[]): Promise<MaterialType[]> {
    if (ids.length === 0) return []
    const { data, error } = await supabase.from("material_types").select("*").in("id", ids)
    if (error) throw error
    return (data ?? []).map(mapRowToMaterialType)
  }

  async getNames(): Promise<Pick<MaterialType, "id" | "name">[]> {
    const { data, error } = await supabase
      .from("material_types")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
    if (error) throw error
    return data ?? []
  }

  async create(input: CreateMaterialType): Promise<MaterialType> {
    const { data, error } = await supabase
      .from("material_types")
      .insert(mapCreateMaterialTypeToInsert(input))
      .select()
      .single()
    if (error) throw error
    return mapRowToMaterialType(data)
  }

  async update(id: string, patch: UpdateMaterialType): Promise<MaterialType> {
    const { data, error } = await supabase
      .from("material_types")
      .update(mapUpdateMaterialTypeToUpdate(patch))
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return mapRowToMaterialType(data)
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("material_types").delete().eq("id", id)
    if (error) throw error
  }
}

export const materialTypeRepository = new MaterialTypeRepository()
