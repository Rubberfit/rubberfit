import "reflect-metadata"
import { injectable } from "tsyringe"

import type { MaterialSupplier } from "@/src/entities/material-supplier"
import type { IMaterialSuppliersRepository } from "@/src/application/repositories/material_suppliers.repository.interface"
import {
  materialSupplierToInsertRow,
  materialSupplierToUpdateRow,
  rowToMaterialSupplier,
  type MaterialSupplierRow,
} from "@/src/infrastructure/mappers/material-supplier.mapper"
import { supabase, type MaterialSupplierWithDetails } from "@/src/infrastructure/models/supabase"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

const TABLE = "material_suppliers"
const SELECT_COLUMNS = "*"

@injectable()
export class MaterialSuppliersRepository implements IMaterialSuppliersRepository {
  async findById(id: string): Promise<MaterialSupplier> {
    const client = await getDatabaseClient()
    const { data, error } = await client.from(TABLE).select(SELECT_COLUMNS).eq("id", id).single()
    if (error) throw error
    return rowToMaterialSupplier(data as MaterialSupplierRow)
  }

  async findActive(): Promise<MaterialSupplier[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .eq("active", true)
      .order("preferred_supplier", { ascending: false })
      .order("cost_per_sqm_cents", { ascending: true })
    if (error) throw error
    return (data as MaterialSupplierRow[]).map(rowToMaterialSupplier)
  }

  async findByMaterialType(materialTypeId: string): Promise<MaterialSupplier[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .eq("material_type_id", materialTypeId)
      .order("preferred_supplier", { ascending: false })
      .order("cost_per_sqm_cents", { ascending: true })
    if (error) throw error
    return (data as MaterialSupplierRow[]).map(rowToMaterialSupplier)
  }

  async findBySupplier(supplierId: string): Promise<MaterialSupplier[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .eq("supplier_id", supplierId)
      .order("preferred_supplier", { ascending: false })
    if (error) throw error
    return (data as MaterialSupplierRow[]).map(rowToMaterialSupplier)
  }

  async findPreferredForMaterialType(materialTypeId: string): Promise<MaterialSupplier | null> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .eq("material_type_id", materialTypeId)
      .eq("preferred_supplier", true)
      .eq("active", true)
      .maybeSingle()
    if (error) throw error
    return data ? rowToMaterialSupplier(data as MaterialSupplierRow) : null
  }

  async insert(link: MaterialSupplier): Promise<MaterialSupplier> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .insert(materialSupplierToInsertRow(link))
      .select(SELECT_COLUMNS)
      .single()
    if (error) throw error
    return rowToMaterialSupplier(data as MaterialSupplierRow)
  }

  async update(link: MaterialSupplier): Promise<MaterialSupplier> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .update(materialSupplierToUpdateRow(link))
      .eq("id", link.id.value)
      .select(SELECT_COLUMNS)
      .single()
    if (error) throw error
    return rowToMaterialSupplier(data as MaterialSupplierRow)
  }

  // ─── Legacy joined-shape read ─────────────────────────────────────────

  async getActiveWithDetails(): Promise<MaterialSupplierWithDetails[]> {
    // Keeps the browser-singleton client (used by pricingPageService
    // server-side, which doesn't go through getDatabaseClient). When
    // the pricing page is rewritten to entity-typed reads, this method
    // is retired and we collapse onto getDatabaseClient.
    const { data, error } = await supabase
      .from(TABLE)
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
