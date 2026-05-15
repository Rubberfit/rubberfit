import "reflect-metadata"
import { injectable } from "tsyringe"

import type { ICutHistoryRepository } from "@/src/application/repositories/cut-history.repository.interface"
import type { CutHistory } from "@/src/entities/cut-history"
import {
  cutHistoryToInsertRow,
  cutHistoryToUpdateRow,
  rowToCutHistory,
  selectionToInsertRow,
  type CutHistoryRow,
  type CutHistorySelectionRow,
} from "@/src/infrastructure/mappers/cut-history.mapper"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

const PARENT_TABLE = "cut_history"
const SELECTION_TABLE = "cut_history_selection"
const SELECT_COLUMNS = "*"

@injectable()
export class CutHistoryRepository implements ICutHistoryRepository {
  async findById(id: string): Promise<CutHistory> {
    const client = await getDatabaseClient()
    const { data: row, error: rowError } = await client
      .from(PARENT_TABLE)
      .select(SELECT_COLUMNS)
      .eq("id", id)
      .single()
    if (rowError) throw rowError

    const { data: selectionRows, error: selectionError } = await client
      .from(SELECTION_TABLE)
      .select(SELECT_COLUMNS)
      .eq("cut_history_id", id)
      .order("selection_index", { ascending: true })
    if (selectionError) throw selectionError

    return rowToCutHistory(row as CutHistoryRow, (selectionRows ?? []) as CutHistorySelectionRow[])
  }

  async findAll(): Promise<CutHistory[]> {
    return this.findManyByQuery((q) => q.is("deleted_at", null))
  }

  async findRecent(limit: number): Promise<CutHistory[]> {
    return this.findManyByQuery((q) => q.is("deleted_at", null).limit(limit))
  }

  async findByUser(userId: string): Promise<CutHistory[]> {
    return this.findManyByQuery((q) => q.is("deleted_at", null).eq("user_id", userId))
  }

  async findByRoll(rollId: string): Promise<CutHistory[]> {
    return this.findManyByQuery((q) => q.is("deleted_at", null).eq("roll_id", rollId))
  }

  async insert(entity: CutHistory): Promise<CutHistory> {
    const client = await getDatabaseClient()

    const { error: parentError } = await client
      .from(PARENT_TABLE)
      .insert(cutHistoryToInsertRow(entity))
    if (parentError) throw parentError

    const selections = entity.selections
    if (selections.length > 0) {
      const insertRows = selections.map((sel) =>
        selectionToInsertRow(sel, entity.id.value, entity.tenantId.value)
      )
      const { error: selectionError } = await client.from(SELECTION_TABLE).insert(insertRows)
      if (selectionError) throw selectionError
    }

    return this.findById(entity.id.value)
  }

  async update(entity: CutHistory): Promise<CutHistory> {
    const client = await getDatabaseClient()
    const { error } = await client
      .from(PARENT_TABLE)
      .update(cutHistoryToUpdateRow(entity))
      .eq("id", entity.id.value)
    if (error) throw error

    return this.findById(entity.id.value)
  }

  /**
   * Shared list helper. Runs the parent query with the caller-supplied
   * filters (newest first by `cut_date`), then bulk-loads the
   * matching selections in ONE round-trip via `IN (...)` and groups
   * them by `cut_history_id`. Avoids the N+1 of fetching selections
   * per row.
   */
  private async findManyByQuery(
    apply: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query: any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => any
  ): Promise<CutHistory[]> {
    const client = await getDatabaseClient()
    const baseQuery = client
      .from(PARENT_TABLE)
      .select(SELECT_COLUMNS)
      .order("cut_date", { ascending: false })

    const { data: rows, error: rowsError } = await apply(baseQuery)
    if (rowsError) throw rowsError

    const parentRows = (rows ?? []) as CutHistoryRow[]
    if (parentRows.length === 0) return []

    const ids = parentRows.map((r) => r.id)
    const { data: selectionRows, error: selectionError } = await client
      .from(SELECTION_TABLE)
      .select(SELECT_COLUMNS)
      .in("cut_history_id", ids)
      .order("selection_index", { ascending: true })
    if (selectionError) throw selectionError

    const grouped = new Map<string, CutHistorySelectionRow[]>()
    for (const sel of (selectionRows ?? []) as CutHistorySelectionRow[]) {
      const list = grouped.get(sel.cut_history_id) ?? []
      list.push(sel)
      grouped.set(sel.cut_history_id, list)
    }

    return parentRows.map((row) => rowToCutHistory(row, grouped.get(row.id) ?? []))
  }
}

export const cutHistoryRepository = new CutHistoryRepository()
