import type { CreateCutHistoryProps, CutHistory } from "@/src/entities/cut-history"
import type { ProfileId } from "@/src/entities/value-objects/id"

/**
 * Entity-typed cut history service. Thin orchestrator over
 * `ICutHistoryRepository` — reads return entities (with selections
 * hydrated); the single create path goes through `CutHistory.create(...)`
 * and `repo.insert(entity)` so domain invariants run server-side.
 *
 * Authorization-aware reads (role-gated `getCutByIdAuthorized`,
 * `listCutHistoryPaginated`, `getCutAnalytics`) remain on the legacy
 * shim until each API route is rewritten through an application-layer
 * use-case.
 *
 * The legacy `insertCutHistory(client, CutHistoryInsert)` path
 * consumed by `RecordCutUseCase` also stays on the legacy shim; this
 * service's `create` is the future replacement once that use-case is
 * refactored to take an `ICutHistoryService` via DI.
 */
export interface ICutHistoryService {
  getById(id: string): Promise<CutHistory>
  getAll(): Promise<CutHistory[]>
  getRecent(limit: number): Promise<CutHistory[]>
  getByUser(userId: string): Promise<CutHistory[]>
  getByRoll(rollId: string): Promise<CutHistory[]>

  create(props: CreateCutHistoryProps): Promise<CutHistory>
  softDelete(id: string, actor: ProfileId): Promise<CutHistory>
}
