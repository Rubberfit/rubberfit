import "reflect-metadata"
import { injectable } from "tsyringe"

import type { Supplier } from "@/src/entities/supplier"
import type { ISuppliersRepository } from "@/src/application/repositories/suppliers.repository.interface"
import {
  rowToSupplier,
  type SupplierRow,
  supplierToInsertRow,
  supplierToUpdateRow,
} from "@/src/infrastructure/mappers/supplier.mapper"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

const TABLE = "suppliers"
const SELECT_COLUMNS = "*"

@injectable()
export class SuppliersRepository implements ISuppliersRepository {
  async findAll(): Promise<Supplier[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .order("name", { ascending: true })

    if (error) throw error
    return (data as SupplierRow[]).map(rowToSupplier)
  }

  async findActive(): Promise<Supplier[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .eq("active", true)
      .order("preferred", { ascending: false })
      .order("name", { ascending: true })

    if (error) throw error
    return (data as SupplierRow[]).map(rowToSupplier)
  }

  async findPreferred(): Promise<Supplier[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .eq("active", true)
      .eq("preferred", true)
      .order("rating", { ascending: false, nullsFirst: false })
      .order("name", { ascending: true })

    if (error) throw error
    return (data as SupplierRow[]).map(rowToSupplier)
  }

  async findById(id: string): Promise<Supplier> {
    const client = await getDatabaseClient()
    const { data, error } = await client.from(TABLE).select(SELECT_COLUMNS).eq("id", id).single()

    if (error) throw error
    return rowToSupplier(data as SupplierRow)
  }

  async search(query: string): Promise<Supplier[]> {
    const client = await getDatabaseClient()
    const sanitized = query.replace(/[%,()*]/g, "").trim()
    if (sanitized === "") return []

    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,notes.ilike.%${sanitized}%`)
      .order("name", { ascending: true })

    if (error) throw error
    return (data as SupplierRow[]).map(rowToSupplier)
  }

  async insert(supplier: Supplier): Promise<Supplier> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .insert(supplierToInsertRow(supplier))
      .select(SELECT_COLUMNS)
      .single()

    if (error) throw error
    return rowToSupplier(data as SupplierRow)
  }

  async update(supplier: Supplier): Promise<Supplier> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .update(supplierToUpdateRow(supplier))
      .eq("id", supplier.id.value)
      .select(SELECT_COLUMNS)
      .single()

    if (error) throw error
    return rowToSupplier(data as SupplierRow)
  }
}

export const suppliersRepository = new SuppliersRepository()
