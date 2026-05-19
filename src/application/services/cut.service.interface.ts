import type { Cut, CutUpdateProps } from "@/src/entities/cut"
import type { ProfileId } from "@/src/entities/value-objects/id"

/**
 * Entity-typed cuts service. Thin orchestrator over `ICutsRepository`
 * — every write path loads the entity, invokes its mutator (which
 * enforces invariants and stamps audit fields), then persists via
 * `repo.update`.
 *
 * Cross-aggregate concerns (decrementing the parent roll on a new cut,
 * notifying on completion) belong in a future `IRecordCutUseCase`
 * orchestrator, NOT here. The redesigned `cuts` row insert is currently
 * not wired to any production UI surface — the live "record cut" flow
 * writes to `cut_history` (a separate aggregate) via
 * `RecordCutUseCase`, which is unrelated.
 *
 * Legacy imperial-shape analytics (waste-by-week, growth %, dashboard
 * cards) live on `legacyCutService` until the dashboard / analytics UI
 * is migrated to entity-typed reads.
 */
export interface ICutService {
  getById(id: string): Promise<Cut>
  getAll(): Promise<Cut[]>
  getByRoll(rollId: string): Promise<Cut[]>
  getRecent(limit: number): Promise<Cut[]>
  getByDateRange(from: Date, to?: Date, opts?: { ascending?: boolean }): Promise<Cut[]>

  updateDetails(id: string, props: CutUpdateProps, actor: ProfileId): Promise<Cut>
  softDelete(id: string, actor: ProfileId): Promise<Cut>
}
