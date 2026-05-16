import "reflect-metadata"
import { inject, injectable } from "tsyringe"
import type { SupabaseClient } from "@supabase/supabase-js"

import { TOKENS } from "@/di/tokens"
import type { ICutHistoryService } from "@/src/application/services/cut-history.service.interface"
import { CutForbiddenError, CutNotFoundError } from "@/src/entities/errors/cut-history.errors"

const PRIVILEGED_DELETE_ROLES = new Set(["admin", "manager"])

function isPrivilegedDelete(roles: readonly string[]): boolean {
  return roles.some((r) => PRIVILEGED_DELETE_ROLES.has(r))
}

export interface DeleteCutInput {
  client: SupabaseClient
  cutId: string
  requesterUserId: string
  requesterRoles: readonly string[]
}

export interface IDeleteCutUseCase {
  execute(input: DeleteCutInput): Promise<void>
}

/**
 * Authorize-then-delete. admin/manager can delete any record; cutters
 * can delete only records they own; everyone else is forbidden.
 * Throws `CutNotFoundError` / `CutForbiddenError`.
 */
@injectable()
export class DeleteCutUseCase implements IDeleteCutUseCase {
  constructor(
    @inject(TOKENS.ICutHistoryService)
    private readonly service: ICutHistoryService
  ) {}

  async execute(input: DeleteCutInput): Promise<void> {
    const cut = await this.service.getByIdRaw(input.client, input.cutId)
    if (!cut) throw new CutNotFoundError()

    const isOwner = cut.user_id === input.requesterUserId
    const isCutter = input.requesterRoles.includes("cutter")
    if (!isPrivilegedDelete(input.requesterRoles) && !(isCutter && isOwner)) {
      throw new CutForbiddenError()
    }

    await this.service.deleteRaw(input.client, input.cutId)
  }
}
