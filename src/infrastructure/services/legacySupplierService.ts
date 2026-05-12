/**
 * @deprecated Legacy raw-row CRUD over the suppliers + material_suppliers
 * tables. Pre-DDD code path retained so the `app/dashboard/inventory/*`
 * pages and the `api-client/rf/inventory.ts` flag-gated client keep
 * type-checking. The underlying schema (post-redesign) no longer has the
 * stale columns this file references (`user_id`, flat `address`/`city`/…
 * fields, `default_shipping_cost`), so most write paths here will fail
 * at runtime against the live DB.
 *
 * **Use `supplierService` (DDD) for new code.** This shim exists only
 * to unblock the supplier-service migration without rewriting every
 * UI surface in the same PR. Follow-up migrations will retire it page
 * by page.
 */
import {
  type Supplier,
  type MaterialSupplier,
  type MaterialSupplierWithDetails,
  type CreateSupplier,
  type UpdateSupplier,
  type CreateMaterialSupplier,
  type UpdateMaterialSupplier,
} from "@/src/infrastructure/models/supabase"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import { priceHistoryService } from "./priceHistoryService"

export interface ILegacySupplierService {
  getAllSuppliers(): Promise<Supplier[]>
  getActiveSuppliers(): Promise<Supplier[]>
  getPreferredSuppliers(): Promise<Supplier[]>
  getSupplierById(id: string): Promise<Supplier>
  createSupplier(supplier: CreateSupplier): Promise<Supplier>
  updateSupplier(id: string, updates: UpdateSupplier): Promise<Supplier>
  deleteSupplier(id: string): Promise<boolean>
  updateSupplierRating(id: string, rating: number): Promise<Supplier>
  searchSuppliers(query: string): Promise<Supplier[]>
  linkMaterialToSupplier(
    materialSupplier: CreateMaterialSupplier
  ): Promise<MaterialSupplierWithDetails>
  unlinkMaterialFromSupplier(materialSupplierId: string): Promise<boolean>
  updateMaterialSupplier(
    id: string,
    updates: UpdateMaterialSupplier
  ): Promise<MaterialSupplierWithDetails>
  getSuppliersByMaterialType(materialTypeId: string): Promise<MaterialSupplierWithDetails[]>
  getMaterialsBySupplier(supplierId: string): Promise<MaterialSupplierWithDetails[]>
  getPreferredSupplierForMaterial(
    materialTypeId: string
  ): Promise<MaterialSupplierWithDetails | null>
  setPreferredSupplier(
    materialTypeId: string,
    supplierId: string
  ): Promise<MaterialSupplierWithDetails>
  checkMaterialSupplierLink(
    materialTypeId: string,
    supplierId: string
  ): Promise<MaterialSupplier | null>
  bulkCreateSuppliers(suppliers: CreateSupplier[]): Promise<Supplier[]>
  bulkLinkMaterialsToSupplier(
    materialSuppliers: CreateMaterialSupplier[]
  ): Promise<MaterialSupplier[]>
  getAllSuppliersOrdered(): Promise<Supplier[]>
  getSuppliers(options?: { filterActive?: boolean; filterPreferred?: boolean }): Promise<Supplier[]>
}

/** @deprecated See module docstring. */
class LegacySupplierService implements ILegacySupplierService {
  async getAllSuppliers(): Promise<Supplier[]> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("name", { ascending: true })
    if (error) throw error
    return data as Supplier[]
  }

  async getActiveSuppliers(): Promise<Supplier[]> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("active", true)
      .order("preferred", { ascending: false })
      .order("name", { ascending: true })
    if (error) throw error
    return data as Supplier[]
  }

  async getPreferredSuppliers(): Promise<Supplier[]> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("active", true)
      .eq("preferred", true)
      .order("rating", { ascending: false })
      .order("name", { ascending: true })
    if (error) throw error
    return data as Supplier[]
  }

  async getSupplierById(id: string): Promise<Supplier> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase.from("suppliers").select("*").eq("id", id).single()
    if (error) throw error
    return data as Supplier
  }

  async createSupplier(supplier: CreateSupplier): Promise<Supplier> {
    const supabase = await getDatabaseClient()
    const user_id = await getCurrentUserId()
    const { data, error } = await supabase
      .from("suppliers")
      .insert([{ ...supplier, user_id }])
      .select()
      .single()
    if (error) throw error
    return data as Supplier
  }

  async updateSupplier(id: string, updates: UpdateSupplier): Promise<Supplier> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("suppliers")
      .update(updates)
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return data as Supplier
  }

  async deleteSupplier(id: string): Promise<boolean> {
    const supabase = await getDatabaseClient()
    const { error } = await supabase.from("suppliers").delete().eq("id", id)
    if (error) throw error
    return true
  }

  async updateSupplierRating(id: string, rating: number): Promise<Supplier> {
    if (rating < 0 || rating > 5) throw new Error("Rating must be between 0 and 5")
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("suppliers")
      .update({ rating })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return data as Supplier
  }

  async linkMaterialToSupplier(
    materialSupplier: CreateMaterialSupplier
  ): Promise<MaterialSupplierWithDetails> {
    const supabase = await getDatabaseClient()
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
  }

  async unlinkMaterialFromSupplier(materialSupplierId: string): Promise<boolean> {
    const supabase = await getDatabaseClient()
    const { error } = await supabase
      .from("material_suppliers")
      .delete()
      .eq("id", materialSupplierId)
    if (error) throw error
    return true
  }

  async updateMaterialSupplier(
    id: string,
    updates: UpdateMaterialSupplier
  ): Promise<MaterialSupplierWithDetails> {
    const supabase = await getDatabaseClient()
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
    return data as MaterialSupplierWithDetails
  }

  async getSuppliersByMaterialType(materialTypeId: string): Promise<MaterialSupplierWithDetails[]> {
    const supabase = await getDatabaseClient()
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
  }

  async getMaterialsBySupplier(supplierId: string): Promise<MaterialSupplierWithDetails[]> {
    const supabase = await getDatabaseClient()
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
  }

  async getPreferredSupplierForMaterial(
    materialTypeId: string
  ): Promise<MaterialSupplierWithDetails | null> {
    const supabase = await getDatabaseClient()
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
  }

  async setPreferredSupplier(
    materialTypeId: string,
    supplierId: string
  ): Promise<MaterialSupplierWithDetails> {
    const supabase = await getDatabaseClient()
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
  }

  async checkMaterialSupplierLink(
    materialTypeId: string,
    supplierId: string
  ): Promise<MaterialSupplier | null> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("material_suppliers")
      .select("id")
      .eq("material_type_id", materialTypeId)
      .eq("supplier_id", supplierId)
      .single()
    if (error && error.code !== "PGRST116") throw error
    return data as MaterialSupplier | null
  }

  async bulkCreateSuppliers(suppliers: CreateSupplier[]): Promise<Supplier[]> {
    const supabase = await getDatabaseClient()
    const user_id = await getCurrentUserId()
    const { data, error } = await supabase
      .from("suppliers")
      .insert(suppliers.map((s) => ({ ...s, user_id })))
      .select()
    if (error) throw error
    return data as Supplier[]
  }

  async bulkLinkMaterialsToSupplier(
    materialSuppliers: CreateMaterialSupplier[]
  ): Promise<MaterialSupplier[]> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("material_suppliers")
      .insert(materialSuppliers)
      .select()
    if (error) throw error
    return data as MaterialSupplier[]
  }

  async getAllSuppliersOrdered(): Promise<Supplier[]> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("preferred", { ascending: false })
      .order("name", { ascending: true })
    if (error) throw error
    return data as Supplier[]
  }

  async getSuppliers(options?: {
    filterActive?: boolean
    filterPreferred?: boolean
  }): Promise<Supplier[]> {
    const supabase = await getDatabaseClient()
    let query = supabase.from("suppliers").select("*")
    if (options?.filterActive) query = query.eq("active", true)
    if (options?.filterPreferred) query = query.eq("preferred", true)
    query = query.order("preferred", { ascending: false }).order("name", { ascending: true })
    const { data, error } = await query
    if (error) throw error
    return data as Supplier[]
  }

  async searchSuppliers(query: string): Promise<Supplier[]> {
    const supabase = await getDatabaseClient()
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
  }
}

/** @deprecated See module docstring. */
export const legacySupplierService: ILegacySupplierService = new LegacySupplierService()
