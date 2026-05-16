import type { SupabaseClient } from "@supabase/supabase-js"

import type { CreateCutHistoryProps, CutHistory } from "@/src/entities/cut-history"
import type { ProfileId } from "@/src/entities/value-objects/id"
import type { CutHistory as CutHistoryRow } from "@/src/infrastructure/models/supabase"

/**
 * Entity-typed cut history service. Thin orchestrator over
 * `ICutHistoryRepository` — reads return entities (with selections
 * hydrated); the single create path goes through `CutHistory.create(...)`
 * and `repo.insert(entity)` so domain invariants run server-side.
 *
 * Transitional raw-row methods (`listPaginatedRaw`, `getAnalyticsRaw`,
 * `getByIdRaw`, `deleteRaw`) accept a caller-supplied admin client
 * and return the legacy raw-row shape from
 * `@/src/infrastructure/models/supabase`. The cut-history API routes
 * and their UI consumers still read legacy columns
 * (`cut_length` inches, `material_id` integer, `material_used_sqft`,
 * ...), so the wire shape must stay raw until the schema is
 * consolidated to the entity-typed mm/sqmm shape. Authorization for
 * these methods lives in application-layer use-cases under
 * `src/application/use-cases/cut-history/`.
 */
export interface ICutHistoryService {
  getById(id: string): Promise<CutHistory>
  getAll(): Promise<CutHistory[]>
  getRecent(limit: number): Promise<CutHistory[]>
  getByUser(userId: string): Promise<CutHistory[]>
  getByRoll(rollId: string): Promise<CutHistory[]>

  create(props: CreateCutHistoryProps): Promise<CutHistory>
  softDelete(id: string, actor: ProfileId): Promise<CutHistory>

  /**
   * Paginated raw-row read. `cutDateFrom` / `cutDateTo` filter the
   * range; `userId` narrows to a specific operator (use-case
   * resolves the privilege scoping before passing it through).
   */
  listPaginatedRaw(
    client: SupabaseClient,
    params: {
      page: number
      limit: number
      cutDateFrom: string | null
      cutDateTo: string | null
      userId: string | null
    }
  ): Promise<{ data: CutHistoryRow[]; total: number }>

  /**
   * Raw-row read by id. Returns `null` when the row is missing so
   * the calling use-case can throw `CutNotFoundError` with the
   * right semantics.
   */
  getByIdRaw(client: SupabaseClient, cutId: string): Promise<CutHistoryRow | null>

  /**
   * Hard-delete the row. The calling use-case is responsible for
   * the authorization check + existence pre-flight.
   */
  deleteRaw(client: SupabaseClient, cutId: string): Promise<void>

  /**
   * Date-range raw-row read for the analytics dashboard. Caller
   * resolves the `userId` scope (null for "all rows in range",
   * concrete id for "this user only"). Caps at the implementation-
   * defined row limit.
   */
  getAnalyticsRaw(
    client: SupabaseClient,
    params: {
      cutDateFrom: string
      cutDateTo: string | null
      userId: string | null
    }
  ): Promise<CutHistoryRow[]>
}
