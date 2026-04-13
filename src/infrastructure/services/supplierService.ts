import {
  supabase,
  type Supplier,
  type MaterialSupplier,
  type MaterialSupplierWithDetails,
  type CreateSupplier,
  type UpdateSupplier,
  type CreateMaterialSupplier,
  type UpdateMaterialSupplier,
} from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import { priceHistoryService } from "./priceHistoryService"
import type { ISupplierService } from "@/src/application/services/supplier.service.interface"
import "reflect-metadata"
import { injectable } from "tsyringe"

@injectable()
export class SupplierService implements ISupplierService {
  async getAllSuppliers(): Promise<Supplier[]> {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("name", { ascending: true })

      if (error) throw error
      return data as Supplier[]
    } catch (error) {
      console.error("Error fetching suppliers:", error)
      throw error
    }
  }

  async getActiveSuppliers(): Promise<Supplier[]> {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("active", true)
        .order("preferred", { ascending: false })
        .order("name", { ascending: true })

      if (error) throw error
      return data as Supplier[]
    } catch (error) {
      console.error("Error fetching active suppliers:", error)
      throw error
    }
  }

  async getPreferredSuppliers(): Promise<Supplier[]> {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("active", true)
        .eq("preferred", true)
        .order("rating", { ascending: false })
        .order("name", { ascending: true })

      if (error) throw error
      return data as Supplier[]
    } catch (error) {
      console.error("Error fetching preferred suppliers:", error)
      throw error
    }
  }

  async getSupplierById(id: string): Promise<Supplier> {
    try {
      const { data, error } = await supabase.from("suppliers").select("*").eq("id", id).single()

      if (error) throw error
      return data as Supplier
    } catch (error) {
      console.error("Error fetching supplier by ID:", error)
      throw error
    }
  }

  async createSupplier(supplier: CreateSupplier): Promise<Supplier> {
    try {
      const user_id = await getCurrentUserId()
      const { data, error } = await supabase
        .from("suppliers")
        .insert([{ ...supplier, user_id }])
        .select()
        .single()

      if (error) throw error
      return data as Supplier
    } catch (error) {
      console.error("Error creating supplier:", error)
      throw error
    }
  }

  async updateSupplier(id: string, updates: UpdateSupplier): Promise<Supplier> {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .update(updates)
        .eq("id", id)
        .select()
        .single()

      if (error) throw error
      return data as Supplier
    } catch (error) {
      console.error("Error updating supplier:", error)
      throw error
    }
  }

  async deleteSupplier(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from("suppliers").delete().eq("id", id)

      if (error) throw error
      return true
    } catch (error) {
      console.error("Error deleting supplier:", error)
      throw error
    }
  }

  async updateSupplierRating(id: string, rating: number): Promise<Supplier> {
    try {
      if (rating < 0 || rating > 5) {
        throw new Error("Rating must be between 0 and 5")
      }

      const { data, error } = await supabase
        .from("suppliers")
        .update({ rating })
        .eq("id", id)
        .select()
        .single()

      if (error) throw error
      return data as Supplier
    } catch (error) {
      console.error("Error updating supplier rating:", error)
      throw error
    }
  }

  async linkMaterialToSupplier(
    materialSupplier: CreateMaterialSupplier
  ): Promise<MaterialSupplierWithDetails> {
    try {
      const user_id = await getCurrentUserId()
      const { data, error } = await supabase
        .from("material_suppliers")
        .insert([{ ...materialSupplier, user_id }])
        .select(
          `
          *,
          material_type:material_types(id, name),
          supplier:suppliers(id, name)
        `
        )
        .single()

      if (error) throw error

      if (data && data.cost_per_sqft) {
        try {
          await priceHistoryService.trackPriceChange(
            data.id,
            undefined,
            data.cost_per_sqft,
            "Initial price when supplier was linked"
          )
        } catch (e) {
          console.error("Failed to track initial price:", e)
        }
      }

      return data as MaterialSupplierWithDetails
    } catch (error) {
      console.error("Error linking material to supplier:", error)
      throw error
    }
  }

  async unlinkMaterialFromSupplier(materialSupplierId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("material_suppliers")
        .delete()
        .eq("id", materialSupplierId)

      if (error) throw error
      return true
    } catch (error) {
      console.error("Error unlinking material from supplier:", error)
      throw error
    }
  }

  async updateMaterialSupplier(
    id: string,
    updates: UpdateMaterialSupplier
  ): Promise<MaterialSupplierWithDetails> {
    try {
      let oldPrice: number | undefined
      if (updates.cost_per_sqft !== undefined) {
        const { data: current } = await supabase
          .from("material_suppliers")
          .select("cost_per_sqft")
          .eq("id", id)
          .single()
        oldPrice = current?.cost_per_sqft
      }

      const { data, error } = await supabase
        .from("material_suppliers")
        .update(updates)
        .eq("id", id)
        .select(
          `
          *,
          material_type:material_types(id, name),
          supplier:suppliers(id, name)
        `
        )
        .single()

      if (error) throw error

      if (data && updates.cost_per_sqft !== undefined && oldPrice !== updates.cost_per_sqft) {
        try {
          await priceHistoryService.trackPriceChange(
            id,
            oldPrice,
            updates.cost_per_sqft,
            "Price updated"
          )
        } catch (e) {
          console.error("Failed to track price change:", e)
        }
      }

      return data as MaterialSupplierWithDetails
    } catch (error) {
      console.error("Error updating material supplier:", error)
      throw error
    }
  }

  async getSuppliersByMaterialType(materialTypeId: string): Promise<MaterialSupplierWithDetails[]> {
    try {
      const { data, error } = await supabase
        .from("material_suppliers")
        .select(
          `
          *,
          supplier:suppliers(*)
        `
        )
        .eq("material_type_id", materialTypeId)
        .eq("active", true)
        .order("preferred_supplier", { ascending: false })
        .order("cost_per_sqft", { ascending: true })

      if (error) throw error
      return data as MaterialSupplierWithDetails[]
    } catch (error) {
      console.error("Error fetching suppliers by material type:", error)
      throw error
    }
  }

  async getMaterialsBySupplier(supplierId: string): Promise<MaterialSupplierWithDetails[]> {
    try {
      const { data, error } = await supabase
        .from("material_suppliers")
        .select(
          `
          *,
          material_type:material_types(*)
        `
        )
        .eq("supplier_id", supplierId)
        .eq("active", true)
        .order("preferred_supplier", { ascending: false })

      if (error) throw error
      return data as MaterialSupplierWithDetails[]
    } catch (error) {
      console.error("Error fetching materials by supplier:", error)
      throw error
    }
  }

  async getPreferredSupplierForMaterial(
    materialTypeId: string
  ): Promise<MaterialSupplierWithDetails | null> {
    try {
      const { data, error } = await supabase
        .from("material_suppliers")
        .select(
          `
          *,
          supplier:suppliers(*)
        `
        )
        .eq("material_type_id", materialTypeId)
        .eq("preferred_supplier", true)
        .eq("active", true)
        .single()

      if (error && error.code !== "PGRST116") throw error
      return data as MaterialSupplierWithDetails | null
    } catch (error) {
      console.error("Error fetching preferred supplier for material:", error)
      throw error
    }
  }

  async setPreferredSupplier(
    materialTypeId: string,
    supplierId: string
  ): Promise<MaterialSupplierWithDetails> {
    try {
      const { error: unsetError } = await supabase
        .from("material_suppliers")
        .update({ preferred_supplier: false })
        .eq("material_type_id", materialTypeId)

      if (unsetError) throw unsetError

      const { data, error } = await supabase
        .from("material_suppliers")
        .update({ preferred_supplier: true })
        .eq("material_type_id", materialTypeId)
        .eq("supplier_id", supplierId)
        .select(
          `
          *,
          material_type:material_types(id, name),
          supplier:suppliers(id, name)
        `
        )
        .single()

      if (error) throw error
      return data as MaterialSupplierWithDetails
    } catch (error) {
      console.error("Error setting preferred supplier:", error)
      throw error
    }
  }

  async checkMaterialSupplierLink(
    materialTypeId: string,
    supplierId: string
  ): Promise<MaterialSupplier | null> {
    try {
      const { data, error } = await supabase
        .from("material_suppliers")
        .select("id")
        .eq("material_type_id", materialTypeId)
        .eq("supplier_id", supplierId)
        .single()

      if (error && error.code !== "PGRST116") throw error
      return data as MaterialSupplier | null
    } catch (error) {
      console.error("Error checking material-supplier link:", error)
      throw error
    }
  }

  async bulkCreateSuppliers(suppliers: CreateSupplier[]): Promise<Supplier[]> {
    try {
      const user_id = await getCurrentUserId()
      const { data, error } = await supabase
        .from("suppliers")
        .insert(suppliers.map((s) => ({ ...s, user_id })))
        .select()

      if (error) throw error
      return data as Supplier[]
    } catch (error) {
      console.error("Error bulk creating suppliers:", error)
      throw error
    }
  }

  async bulkLinkMaterialsToSupplier(
    materialSuppliers: CreateMaterialSupplier[]
  ): Promise<MaterialSupplier[]> {
    try {
      const { data, error } = await supabase
        .from("material_suppliers")
        .insert(materialSuppliers)
        .select()

      if (error) throw error
      return data as MaterialSupplier[]
    } catch (error) {
      console.error("Error bulk linking materials to supplier:", error)
      throw error
    }
  }

  async getAllSuppliersOrdered(): Promise<Supplier[]> {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("preferred", { ascending: false })
        .order("name", { ascending: true })

      if (error) throw error
      return data as Supplier[]
    } catch (error) {
      console.error("Error fetching ordered suppliers:", error)
      throw error
    }
  }

  async getSuppliers(options?: {
    filterActive?: boolean
    filterPreferred?: boolean
  }): Promise<Supplier[]> {
    try {
      let query = supabase.from("suppliers").select("*")

      if (options?.filterActive) {
        query = query.eq("active", true)
      }

      if (options?.filterPreferred) {
        query = query.eq("preferred", true)
      }

      query = query.order("preferred", { ascending: false }).order("name", { ascending: true })

      const { data, error } = await query

      if (error) throw error
      return data as Supplier[]
    } catch (error) {
      console.error("Error fetching suppliers with filters:", error)
      throw error
    }
  }

  async searchSuppliers(query: string): Promise<Supplier[]> {
    try {
      const sanitized = query.replace(/[%,.*()]/g, "")
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .or(
          `name.ilike.%${sanitized}%,contact_person.ilike.%${sanitized}%,email.ilike.%${sanitized}%,city.ilike.%${sanitized}%`
        )
        .order("name", { ascending: true })

      if (error) throw error
      return data as Supplier[]
    } catch (error) {
      console.error("Error searching suppliers:", error)
      throw error
    }
  }
}

export const supplierService = new SupplierService()
