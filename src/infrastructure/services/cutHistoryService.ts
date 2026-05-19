import "reflect-metadata"
import type { SupabaseClient } from "@supabase/supabase-js"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { ICutHistoryRepository } from "@/src/application/repositories/cut-history.repository.interface"
import type { ICutHistoryService } from "@/src/application/services/cut-history.service.interface"
import { CutHistory, type CreateCutHistoryProps } from "@/src/entities/cut-history"
import type { ProfileId } from "@/src/entities/value-objects/id"
import type { CutHistory as CutHistoryRow } from "@/src/infrastructure/models/supabase"
import { cutHistoryRepository } from "@/src/infrastructure/repositories/cut-history.repository"

const ANALYTICS_MAX_ROWS = 10000

/**
 * Thin orchestrator over `ICutHistoryRepository` for entity-typed
 * reads/writes, plus a transitional raw-row surface
 * (`listPaginatedRaw`, `getByIdRaw`, `getByIdsRaw`, `deleteRaw`,
 * `getAnalyticsRaw`) consumed by the cut-history API routes and the
 * CSV export action via application-layer use-cases. The raw methods
 * retire when the `cut_history` schema consolidates to the
 * entity-typed mm/sqmm shape.
 *
 * Domain errors (`InvalidEntityError`, `InvalidValueObjectError`)
 * propagate unwrapped — the action layer's catch wrappers handle
 * them. Authorization gating is NOT here; it lives in use-cases.
 */
@injectable()
export class CutHistoryService implements ICutHistoryService {
  constructor(
    @inject(TOKENS.ICutHistoryRepository)
    private readonly repo: ICutHistoryRepository
  ) {}

  getById(id: string): Promise<CutHistory> {
    return this.repo.findById(id)
  }

  getAll(): Promise<CutHistory[]> {
    return this.repo.findAll()
  }

  getRecent(limit: number): Promise<CutHistory[]> {
    return this.repo.findRecent(limit)
  }

  getByUser(userId: string): Promise<CutHistory[]> {
    return this.repo.findByUser(userId)
  }

  getByRoll(rollId: string): Promise<CutHistory[]> {
    return this.repo.findByRoll(rollId)
  }

  async create(props: CreateCutHistoryProps): Promise<CutHistory> {
    const entity = CutHistory.create(props)
    return this.repo.insert(entity)
  }

  async softDelete(id: string, actor: ProfileId): Promise<CutHistory> {
    const entity = await this.repo.findById(id)
    entity.softDelete(actor)
    return this.repo.update(entity)
  }

  async listPaginatedRaw(
    client: SupabaseClient,
    params: {
      page: number
      limit: number
      cutDateFrom: string | null
      cutDateTo: string | null
      userId: string | null
    }
  ): Promise<{ data: CutHistoryRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit
    let query = client
      .from("cut_history")
      .select("*", { count: "exact" })
      .order("cut_date", { ascending: false })
      .range(offset, offset + params.limit - 1)

    if (params.userId !== null) query = query.eq("user_id", params.userId)
    if (params.cutDateFrom !== null) query = query.gte("cut_date", params.cutDateFrom)
    if (params.cutDateTo !== null) query = query.lte("cut_date", params.cutDateTo)

    const { data, error, count } = await query
    if (error) {
      console.error("listPaginatedRaw query error:", error)
      throw error
    }
    return { data: (data ?? []) as CutHistoryRow[], total: count ?? 0 }
  }

  async getByIdRaw(client: SupabaseClient, cutId: string): Promise<CutHistoryRow | null> {
    const { data, error } = await client
      .from("cut_history")
      .select("*")
      .eq("id", cutId)
      .maybeSingle()

    if (error) {
      console.error("cut_history getByIdRaw error:", error)
      throw error
    }
    return (data ?? null) as CutHistoryRow | null
  }

  async getByIdsRaw(client: SupabaseClient, cutIds: readonly string[]): Promise<CutHistoryRow[]> {
    if (cutIds.length === 0) return []
    const { data, error } = await client
      .from("cut_history")
      .select("*")
      .in("id", cutIds)
      .order("cut_date", { ascending: false })

    if (error) {
      console.error("cut_history getByIdsRaw error:", error)
      throw error
    }
    return (data ?? []) as CutHistoryRow[]
  }

  async deleteRaw(client: SupabaseClient, cutId: string): Promise<void> {
    const { error } = await client.from("cut_history").delete().eq("id", cutId)
    if (error) {
      console.error("cut_history deleteRaw error:", error)
      throw new Error("Failed to delete cut record")
    }
  }

  async getAnalyticsRaw(
    client: SupabaseClient,
    params: {
      cutDateFrom: string
      cutDateTo: string | null
      userId: string | null
    }
  ): Promise<CutHistoryRow[]> {
    let query = client
      .from("cut_history")
      .select("*")
      .gte("cut_date", params.cutDateFrom)
      .order("cut_date", { ascending: true })
      .limit(ANALYTICS_MAX_ROWS)

    if (params.cutDateTo !== null) query = query.lte("cut_date", params.cutDateTo)
    if (params.userId !== null) query = query.eq("user_id", params.userId)

    const { data, error } = await query
    if (error) {
      console.error("getAnalyticsRaw query error:", error)
      throw error
    }
    return (data ?? []) as CutHistoryRow[]
  }
}

/**
 * Module-level singleton bound to the concrete `cutHistoryRepository`.
 * New consumers (use-cases, server actions) resolve through DI.
 */
export const cutHistoryService: ICutHistoryService = new CutHistoryService(cutHistoryRepository)
