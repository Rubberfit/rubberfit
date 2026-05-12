import "reflect-metadata"
import { injectable } from "tsyringe"

import type { MaterialType as MaterialTypeEntity } from "@/src/entities/material-type"
import {
  materialTypeToInsertRow,
  materialTypeToUpdateRow,
  rowToMaterialType,
  type MaterialTypeRow,
} from "@/src/infrastructure/mappers/material-type.mapper"
import { type MaterialType } from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"
import type { IMaterialTypeRepository } from "@/src/application/repositories/material_types.repository.interface"

@injectable()
export class MaterialTypeRepository implements IMaterialTypeRepository {
  // ─── Entity-typed (new DDD surface) ───────────────────────────────────

  async findAll(): Promise<MaterialTypeEntity[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from("material_types")
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true })
    if (error) throw error
    return (data as MaterialTypeRow[]).map(rowToMaterialType)
  }

  async findById(id: string): Promise<MaterialTypeEntity> {
    const client = await getDatabaseClient()
    const { data, error } = await client.from("material_types").select("*").eq("id", id).single()
    if (error) throw error
    return rowToMaterialType(data as MaterialTypeRow)
  }

  async findByIds(ids: string[]): Promise<MaterialTypeEntity[]> {
    if (ids.length === 0) return []
    const client = await getDatabaseClient()
    const { data, error } = await client.from("material_types").select("*").in("id", ids)
    if (error) throw error
    return (data as MaterialTypeRow[]).map(rowToMaterialType)
  }

  async insert(entity: MaterialTypeEntity): Promise<MaterialTypeEntity> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from("material_types")
      .insert(materialTypeToInsertRow(entity))
      .select("*")
      .single()
    if (error) throw error
    return rowToMaterialType(data as MaterialTypeRow)
  }

  async updateEntity(entity: MaterialTypeEntity): Promise<MaterialTypeEntity> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from("material_types")
      .update(materialTypeToUpdateRow(entity))
      .eq("id", entity.id.value)
      .select("*")
      .single()
    if (error) throw error
    return rowToMaterialType(data as MaterialTypeRow)
  }

  // ─── Legacy raw-row surface (pre-DDD consumers) ───────────────────────

  async getAll(): Promise<MaterialType[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from("material_types")
      .select("*")
      .order("name", { ascending: true })

    if (error) throw error
    return data as MaterialType[]
  }

  async getByIds(ids: string[]): Promise<MaterialType[]> {
    if (ids.length === 0) return []
    const client = await getDatabaseClient()
    const { data, error } = await client.from("material_types").select("*").in("id", ids)

    if (error) throw error
    return data as MaterialType[]
  }

  async getNames(): Promise<Pick<MaterialType, "id" | "name">[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from("material_types")
      .select("id, name")
      .order("name", { ascending: true })

    if (error) throw error
    return data as Pick<MaterialType, "id" | "name">[]
  }

  async getTopByCost(limit: number): Promise<MaterialType[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from("material_types")
      .select("*")
      .order("default_cost", { ascending: false })
      .limit(limit)

    if (error) throw error
    return data as MaterialType[]
  }

  async create(
    material: Omit<MaterialType, "id" | "user_id" | "created_at" | "updated_at">,
    userId?: string
  ): Promise<MaterialType> {
    // Server-action callers pass actor.id explicitly. Browser callers
    // can omit it; the fallback keeps legacy paths working.
    const user_id = userId ?? (await getCurrentUserId())
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from("material_types")
      .insert([{ ...material, user_id }])
      .select()
      .single()

    if (error) throw error
    return data as MaterialType
  }

  async update(id: string, updates: Partial<MaterialType>): Promise<MaterialType> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from("material_types")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return data as MaterialType
  }

  async delete(id: string): Promise<void> {
    const client = await getDatabaseClient()
    const { error } = await client.from("material_types").delete().eq("id", id)

    if (error) throw error
  }
}

export const materialTypeRepository = new MaterialTypeRepository()
