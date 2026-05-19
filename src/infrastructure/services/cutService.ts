import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { ICutsRepository } from "@/src/application/repositories/cuts.repository.interface"
import type { ICutService } from "@/src/application/services/cut.service.interface"
import type { Cut, CutUpdateProps } from "@/src/entities/cut"
import type { ProfileId } from "@/src/entities/value-objects/id"
import { cutsRepository } from "@/src/infrastructure/repositories/cuts.repository"

/**
 * Thin orchestrator over `ICutsRepository`. Each write path loads the
 * entity, invokes its mutator (which enforces invariants and stamps
 * audit fields), then persists via `repo.update`.
 *
 * Domain errors (`InvalidEntityError`, `InvalidValueObjectError`)
 * propagate unwrapped — the action layer's catch wrappers handle them.
 *
 * Cross-aggregate operations (decrementing the parent roll on a new
 * cut, notifying on completion) are NOT here. The `cuts` table is not
 * currently wired to a production "record cut" UI surface — the live
 * cut-recording flow writes to `cut_history` via `RecordCutUseCase`,
 * which is a separate aggregate. When a `cuts`-table UI is built, the
 * orchestration belongs in a future `IRecordCutFromCutsTableUseCase`.
 */
@injectable()
export class CutService implements ICutService {
  constructor(
    @inject(TOKENS.ICutsRepository)
    private readonly repo: ICutsRepository
  ) {}

  getById(id: string): Promise<Cut> {
    return this.repo.findById(id)
  }

  getAll(): Promise<Cut[]> {
    return this.repo.findAll()
  }

  getByRoll(rollId: string): Promise<Cut[]> {
    return this.repo.findByRoll(rollId)
  }

  getRecent(limit: number): Promise<Cut[]> {
    return this.repo.findRecent(limit)
  }

  getByDateRange(from: Date, to?: Date, opts?: { ascending?: boolean }): Promise<Cut[]> {
    return this.repo.findByDateRange(from, to, opts)
  }

  async updateDetails(id: string, props: CutUpdateProps, actor: ProfileId): Promise<Cut> {
    const cut = await this.repo.findById(id)
    cut.updateDetails(props, actor)
    return this.repo.update(cut)
  }

  async softDelete(id: string, actor: ProfileId): Promise<Cut> {
    const cut = await this.repo.findById(id)
    cut.softDelete(actor)
    return this.repo.update(cut)
  }
}

/**
 * Module-level singleton bound to the concrete `cutsRepository`. New
 * consumers (use-cases, server actions) resolve through DI; legacy
 * `app/` consumers that imported the old imperial-typed `cutService`
 * are routed through `legacyCutService` instead — they keep their
 * raw-row shape until the relevant UI surface is rewritten.
 */
export const cutService: ICutService = new CutService(cutsRepository)
