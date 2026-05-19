import "reflect-metadata"
import { inject, injectable } from "tsyringe"
import type { SupabaseClient } from "@supabase/supabase-js"

import { TOKENS } from "@/di/tokens"
import type { ICutHistoryService } from "@/src/application/services/cut-history.service.interface"
import { CutForbiddenError, CutNotFoundError } from "@/src/entities/errors/cut-history.errors"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

const PRIVILEGED_VIEW_ROLES = new Set(["admin", "manager", "supervisor"])

function isPrivilegedView(roles: readonly string[]): boolean {
  return roles.some((r) => PRIVILEGED_VIEW_ROLES.has(r))
}

export interface GetCutByIdInput {
  client: SupabaseClient
  cutId: string
  requesterUserId: string
  requesterRoles: readonly string[]
}

export interface IGetCutByIdUseCase {
  execute(input: GetCutByIdInput): Promise<CutHistory>
}

/**
 * Fetches a cut by id and authorizes the caller. Privileged roles
 * (admin/manager/supervisor) can view any record; other users can
 * only view records they own. Throws `CutNotFoundError` /
 * `CutForbiddenError` so the route handler can map to 404 / 403.
 */
@injectable()
export class GetCutByIdUseCase implements IGetCutByIdUseCase {
  constructor(
    @inject(TOKENS.ICutHistoryService)
    private readonly service: ICutHistoryService
  ) {}

  async execute(input: GetCutByIdInput): Promise<CutHistory> {
    const cut = await this.service.getByIdRaw(input.client, input.cutId)
    if (!cut) throw new CutNotFoundError()

    const isOwner = cut.user_id === input.requesterUserId
    if (!isOwner && !isPrivilegedView(input.requesterRoles)) {
      throw new CutForbiddenError()
    }

    return cut
  }
}
