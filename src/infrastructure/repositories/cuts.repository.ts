import "reflect-metadata"
import { injectable } from "tsyringe"

import type { ICutsRepository } from "@/src/application/repositories/cuts.repository.interface"
import type { Cut } from "@/src/entities/cut"
import {
  cutToInsertRow,
  cutToUpdateRow,
  rowToCut,
  type CutRow,
} from "@/src/infrastructure/mappers/cut.mapper"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

const TABLE = "cuts"
const SELECT_COLUMNS = "*"

@injectable()
export class CutsRepository implements ICutsRepository {
  async findById(id: string): Promise<Cut> {
    const client = await getDatabaseClient()
    const { data, error } = await client.from(TABLE).select(SELECT_COLUMNS).eq("id", id).single()
    if (error) throw error
    return rowToCut(data as CutRow)
  }

  async findAll(): Promise<Cut[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data as CutRow[]).map(rowToCut)
  }

  async findByRoll(rollId: string): Promise<Cut[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .eq("roll_id", rollId)
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data as CutRow[]).map(rowToCut)
  }

  async findRecent(limit: number): Promise<Cut[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data as CutRow[]).map(rowToCut)
  }

  async findByDateRange(from: Date, to?: Date, opts?: { ascending?: boolean }): Promise<Cut[]> {
    const client = await getDatabaseClient()
    let query = client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .gte("created_at", from.toISOString())
      .order("created_at", { ascending: opts?.ascending ?? false })

    if (to) {
      query = query.lte("created_at", to.toISOString())
    }

    const { data, error } = await query
    if (error) throw error
    return (data as CutRow[]).map(rowToCut)
  }

  async insert(cut: Cut): Promise<Cut> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .insert(cutToInsertRow(cut))
      .select(SELECT_COLUMNS)
      .single()
    if (error) throw error
    return rowToCut(data as CutRow)
  }

  async update(cut: Cut): Promise<Cut> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .update(cutToUpdateRow(cut))
      .eq("id", cut.id.value)
      .select(SELECT_COLUMNS)
      .single()
    if (error) throw error
    return rowToCut(data as CutRow)
  }
}

export const cutsRepository = new CutsRepository()
