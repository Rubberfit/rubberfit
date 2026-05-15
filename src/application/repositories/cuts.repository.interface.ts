import type { Cut } from "@/src/entities/cut"

/**
 * Cuts persistence boundary — entity-typed surface for the redesigned
 * `cuts` table (mm-native dimensions, sqmm-native waste, tenant-scoped).
 *
 * The legacy imperial-typed cut analytics (waste-by-week, growth %,
 * dashboard cards) live on `legacyCutService` and operate against
 * pre-redesign column shapes that no longer exist in the live schema —
 * those methods will be retired as the dashboard / analytics UI is
 * migrated to entity-typed reads.
 */
export interface ICutsRepository {
  /** Returns the entity for `id`, or throws if not found. */
  findById(id: string): Promise<Cut>

  /** All non-deleted cuts, newest first. */
  findAll(): Promise<Cut[]>

  /** Cuts against a given roll, newest first. */
  findByRoll(rollId: string): Promise<Cut[]>

  /** N most recent non-deleted cuts. */
  findRecent(limit: number): Promise<Cut[]>

  /**
   * Cuts in a date window (inclusive). `to` defaults to now. `ascending`
   * defaults to false (newest first).
   */
  findByDateRange(from: Date, to?: Date, opts?: { ascending?: boolean }): Promise<Cut[]>

  /** Persists a freshly-built `Cut` entity. Returns the rehydrated entity. */
  insert(cut: Cut): Promise<Cut>

  /**
   * Persists state-transition mutations (updateDetails, softDelete) by
   * flattening the mutable fields onto the row. Caller has already
   * invoked the entity mutator and is the source of truth for the new
   * state.
   */
  update(cut: Cut): Promise<Cut>
}
