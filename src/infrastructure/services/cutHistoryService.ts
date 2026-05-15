import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { ICutHistoryRepository } from "@/src/application/repositories/cut-history.repository.interface"
import type { ICutHistoryService } from "@/src/application/services/cut-history.service.interface"
import { CutHistory, type CreateCutHistoryProps } from "@/src/entities/cut-history"
import type { ProfileId } from "@/src/entities/value-objects/id"
import { cutHistoryRepository } from "@/src/infrastructure/repositories/cut-history.repository"

/**
 * Thin orchestrator over `ICutHistoryRepository`. Reads delegate
 * directly; the single create path builds the entity via
 * `CutHistory.create(...)` (which enforces invariants and the
 * selections collection contract) then persists via `repo.insert`.
 *
 * Domain errors (`InvalidEntityError`, `InvalidValueObjectError`)
 * propagate unwrapped — the action layer's catch wrappers handle
 * them.
 *
 * Authorization gating is NOT here. Role-aware reads / deletes live
 * on `legacyCutHistoryService` until each consumer API route is
 * rewritten through an application-layer use-case (e.g.
 * `GetCutHistoryUseCase`, `DeleteCutHistoryUseCase`).
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
}

/**
 * Module-level singleton bound to the concrete `cutHistoryRepository`.
 * New consumers (use-cases, server actions) resolve through DI; legacy
 * `app/` consumers that imported named exports from the old
 * `cutHistoryService` module (`insertCutHistory`, `getCutByIdAuthorized`,
 * etc.) are routed through `legacyCutHistoryService` instead — they
 * keep their raw-row shape and authorization-aware methods until each
 * API route is rewritten.
 */
export const cutHistoryService: ICutHistoryService = new CutHistoryService(cutHistoryRepository)
