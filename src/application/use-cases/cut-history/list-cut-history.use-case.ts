import "reflect-metadata"
import { inject, injectable } from "tsyringe"
import type { SupabaseClient } from "@supabase/supabase-js"

import { TOKENS } from "@/di/tokens"
import type { ICutHistoryService } from "@/src/application/services/cut-history.service.interface"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

const PRIVILEGED_VIEW_ROLES = new Set(["admin", "manager", "supervisor"])

function isPrivilegedView(roles: readonly string[]): boolean {
  return roles.some((r) => PRIVILEGED_VIEW_ROLES.has(r))
}

export interface ListCutHistoryInput {
  client: SupabaseClient
  page: number
  limit: number
  from: string | null
  to: string | null
  filterUserId: string | null
  requesterUserId: string
  requesterRoles: readonly string[]
}

export interface ListCutHistoryResult {
  data: CutHistory[]
  total: number
}

export interface IListCutHistoryUseCase {
  execute(input: ListCutHistoryInput): Promise<ListCutHistoryResult>
}

/**
 * Paginated cut-history listing with privilege scoping. Privileged
 * roles (admin/manager/supervisor) see all rows, optionally narrowed
 * by `filterUserId`; non-privileged users always see only their own.
 *
 * Returns raw legacy row shape (`CutHistory` from
 * `@/src/infrastructure/models/supabase`) because UI consumers read
 * legacy columns directly (`cut_length`, `material_id`,
 * `material_used_sqft`, ...). The entity-typed projection lives on
 * `ICutHistoryService` for new code.
 */
@injectable()
export class ListCutHistoryUseCase implements IListCutHistoryUseCase {
  constructor(
    @inject(TOKENS.ICutHistoryService)
    private readonly service: ICutHistoryService
  ) {}

  async execute(input: ListCutHistoryInput): Promise<ListCutHistoryResult> {
    const isPrivileged = isPrivilegedView(input.requesterRoles)
    const scopedUserId = isPrivileged ? input.filterUserId : input.requesterUserId

    return this.service.listPaginatedRaw(input.client, {
      page: input.page,
      limit: input.limit,
      cutDateFrom: input.from,
      cutDateTo: input.to,
      userId: scopedUserId,
    })
  }
}
