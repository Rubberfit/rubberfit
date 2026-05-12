import "reflect-metadata"
import { injectable } from "tsyringe"

import type { PriceHistory } from "@/src/entities/price-history"
import type { IPriceHistoryRepository } from "@/src/application/repositories/price-history.repository.interface"
import type { PriceHistoryWithJoins } from "@/src/application/services/price-history.service.interface"
import {
  priceHistoryToInsertRow,
  rowToPriceHistory,
  type PriceHistoryRow,
} from "@/src/infrastructure/mappers/price-history.mapper"
import { supabase } from "@/src/infrastructure/models/supabase"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

const TABLE = "price_history"

@injectable()
export class PriceHistoryRepository implements IPriceHistoryRepository {
  async insert(entry: PriceHistory): Promise<PriceHistory> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .insert(priceHistoryToInsertRow(entry))
      .select("*")
      .single()
    if (error) throw error
    return rowToPriceHistory(data as PriceHistoryRow)
  }

  async findByMaterialSupplier(
    materialSupplierId: string,
    limit?: number
  ): Promise<PriceHistory[]> {
    const client = await getDatabaseClient()
    let query = client
      .from(TABLE)
      .select("*")
      .eq("material_supplier_id", materialSupplierId)
      .order("effective_date", { ascending: false })
    if (limit !== undefined) query = query.limit(limit)
    const { data, error } = await query
    if (error) throw error
    return (data as PriceHistoryRow[]).map(rowToPriceHistory)
  }

  // ─── Legacy joined-shape reads (pricing-dashboard UI) ─────────────────

  async findByMaterialType(
    materialTypeId: string,
    daysBack: number
  ): Promise<PriceHistoryWithJoins[]> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    const { data: materialSuppliers, error: msError } = await supabase
      .from("material_suppliers")
      .select("id, supplier_id")
      .eq("material_type_id", materialTypeId)
    if (msError) throw msError
    if (!materialSuppliers || materialSuppliers.length === 0) return []

    const materialSupplierIds = materialSuppliers.map((ms: { id: string }) => ms.id)

    const { data, error } = await supabase
      .from(TABLE)
      .select(
        `
        *,
        material_supplier:material_suppliers!inner(
          supplier:suppliers(id, name)
        )
      `
      )
      .in("material_supplier_id", materialSupplierIds)
      .gte("effective_date", startDate.toISOString())
      .order("effective_date", { ascending: false })

    if (error) throw error
    return (data ?? []) as PriceHistoryWithJoins[]
  }

  async findByDateRange(startDate: Date): Promise<PriceHistoryWithJoins[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(
        `
        *,
        material_supplier:material_suppliers(
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        )
      `
      )
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []) as PriceHistoryWithJoins[]
  }

  async findSignificantChanges(
    thresholdPercentage: number,
    daysBack: number
  ): Promise<PriceHistoryWithJoins[]> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    const { data, error } = await supabase
      .from(TABLE)
      .select(
        `
        *,
        material_supplier:material_suppliers(
          material_type:material_types(id, name),
          supplier:suppliers(id, name)
        )
      `
      )
      .gte("effective_date", startDate.toISOString())
      .or(
        `price_change_percentage.gt.${thresholdPercentage},price_change_percentage.lt.${-thresholdPercentage}`
      )
      .order("effective_date", { ascending: false })
    if (error) throw error
    return (data ?? []) as PriceHistoryWithJoins[]
  }
}

export const priceHistoryRepository = new PriceHistoryRepository()
