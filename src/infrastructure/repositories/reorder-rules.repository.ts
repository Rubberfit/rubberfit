import "reflect-metadata"
import { injectable } from "tsyringe"

import type { ReorderRule } from "@/src/entities/reorder-rule"
import type { IReorderRulesRepository } from "@/src/application/repositories/reorder-rules.repository.interface"
import {
  reorderRuleToInsertRow,
  reorderRuleToUpdateRow,
  rowToReorderRule,
  type ReorderRuleRow,
} from "@/src/infrastructure/mappers/reorder-rule.mapper"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

const TABLE = "reorder_rules"
const SELECT_COLUMNS = "*"

@injectable()
export class ReorderRulesRepository implements IReorderRulesRepository {
  async findById(id: string): Promise<ReorderRule> {
    const client = await getDatabaseClient()
    const { data, error } = await client.from(TABLE).select(SELECT_COLUMNS).eq("id", id).single()
    if (error) throw error
    return rowToReorderRule(data as ReorderRuleRow)
  }

  async findActive(): Promise<ReorderRule[]> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .eq("active", true)
      .order("material_type_id", { ascending: true })
    if (error) throw error
    return (data as ReorderRuleRow[]).map(rowToReorderRule)
  }

  async findByMaterialType(materialTypeId: string): Promise<ReorderRule | null> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .eq("material_type_id", materialTypeId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return rowToReorderRule(data as ReorderRuleRow)
  }

  async insert(rule: ReorderRule): Promise<ReorderRule> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .insert(reorderRuleToInsertRow(rule))
      .select(SELECT_COLUMNS)
      .single()
    if (error) throw error
    return rowToReorderRule(data as ReorderRuleRow)
  }

  async update(rule: ReorderRule): Promise<ReorderRule> {
    const client = await getDatabaseClient()
    const { data, error } = await client
      .from(TABLE)
      .update(reorderRuleToUpdateRow(rule))
      .eq("id", rule.id.value)
      .select(SELECT_COLUMNS)
      .single()
    if (error) throw error
    return rowToReorderRule(data as ReorderRuleRow)
  }
}

export const reorderRulesRepository: IReorderRulesRepository = new ReorderRulesRepository()
