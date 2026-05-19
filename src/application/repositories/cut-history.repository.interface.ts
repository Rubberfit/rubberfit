import type { CutHistory } from "@/src/entities/cut-history"

/**
 * CutHistory persistence boundary — entity-typed surface for the
 * redesigned `cut_history` table (mm/sqmm-native, tenant-scoped, with
 * a normalized `cut_history_selection` child collection).
 *
 * Authorization-aware reads live in application-layer use-cases
 * under `src/application/use-cases/cut-history/`. This interface
 * stays focused on the persistence boundary.
 */
export interface ICutHistoryRepository {
  /**
   * Returns the entity for `id` (with its selections collection
   * hydrated), or throws if not found.
   */
  findById(id: string): Promise<CutHistory>

  /** All non-deleted cut history rows, newest first by `cut_date`. */
  findAll(): Promise<CutHistory[]>

  /** N most recent non-deleted rows, newest first by `cut_date`. */
  findRecent(limit: number): Promise<CutHistory[]>

  /** Cut history rows for a given operator, newest first by `cut_date`. */
  findByUser(userId: string): Promise<CutHistory[]>

  /** Cut history rows for a given source roll, newest first by `cut_date`. */
  findByRoll(rollId: string): Promise<CutHistory[]>

  /**
   * Persists a freshly-built `CutHistory` entity AND its selection
   * collection. The parent row is inserted first; selection rows are
   * bulk-inserted in a second statement. Returns the rehydrated entity
   * (re-reads parent + selections by id so DB defaults like
   * `created_at`/`gen_random_uuid()`-issued selection IDs round-trip).
   */
  insert(entity: CutHistory): Promise<CutHistory>

  /**
   * Persists state-transition mutations (currently only `softDelete`)
   * by stamping audit fields + `deleted_at` on the parent row. The
   * selections collection is never modified after `create()`, so it is
   * NOT touched on update.
   */
  update(entity: CutHistory): Promise<CutHistory>
}
