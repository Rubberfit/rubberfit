import { supabase, type MaterialType } from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/app/lib/getCurrentUserId"

export const materialTypeService = {
  async getAll() {
    const { data, error } = await supabase
      .from("material_types")
      .select("*")
      .order("name", { ascending: true })

    if (error) throw error
    return data as MaterialType[]
  },

  async getByIds(ids: string[]) {
    if (ids.length === 0) return []
    const { data, error } = await supabase.from("material_types").select("*").in("id", ids)

    if (error) throw error
    return data as MaterialType[]
  },

  async getNames() {
    const { data, error } = await supabase
      .from("material_types")
      .select("id, name")
      .order("name", { ascending: true })

    if (error) throw error
    return data as Pick<MaterialType, "id" | "name">[]
  },

  async getTopByCost(limit: number) {
    const { data, error } = await supabase
      .from("material_types")
      .select("*")
      .order("default_cost", { ascending: false })
      .limit(limit)

    if (error) throw error
    return data as MaterialType[]
  },

  async create(material: Omit<MaterialType, "id" | "user_id" | "created_at" | "updated_at">) {
    const user_id = await getCurrentUserId()
    const { data, error } = await supabase
      .from("material_types")
      .insert([{ ...material, user_id }])
      .select()
      .single()

    if (error) throw error
    return data as MaterialType
  },

  async update(id: string, updates: Partial<MaterialType>) {
    const { data, error } = await supabase
      .from("material_types")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return data as MaterialType
  },

  async delete(id: string) {
    const { error } = await supabase.from("material_types").delete().eq("id", id)

    if (error) throw error
  },
}
