import { supabase, type MaterialSupplierWithDetails } from "@/src/infrastructure/models/supabase"
import type { IMaterialSuppliersRepository } from "@/src/application/repositories/material_suppliers.repository.interface"

export class MaterialSuppliersRepository implements IMaterialSuppliersRepository {
  async getActiveWithDetails(): Promise<MaterialSupplierWithDetails[]> {
    const { data, error } = await supabase
      .from("material_suppliers")
      .select(
        `
        *,
        material_type:material_types(*),
        supplier:suppliers(*)
      `
      )
      .eq("active", true)

    if (error) throw error
    return (data ?? []) as MaterialSupplierWithDetails[]
  }
}

export const materialSuppliersRepository = new MaterialSuppliersRepository()
