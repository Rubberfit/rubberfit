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

export interface GetCutAnalyticsInput {
  client: SupabaseClient
  from: string
  to: string | null
  requesterUserId: string
  requesterRoles: readonly string[]
  filterUserId: string | null
}

export interface IGetCutAnalyticsUseCase {
  execute(input: GetCutAnalyticsInput): Promise<CutHistory[]>
}

/**
 * Date-range cut-history rows for the analytics dashboard. Privileged
 * users (admin/manager/supervisor) see all rows in range, optionally
 * narrowed to a specific user via `filterUserId`. Non-privileged
 * users always see only their own rows regardless of `filterUserId`.
 */
@injectable()
export class GetCutAnalyticsUseCase implements IGetCutAnalyticsUseCase {
  constructor(
    @inject(TOKENS.ICutHistoryService)
    private readonly service: ICutHistoryService
  ) {}

  async execute(input: GetCutAnalyticsInput): Promise<CutHistory[]> {
    const isPrivileged = isPrivilegedView(input.requesterRoles)
    const scopedUserId = isPrivileged ? input.filterUserId : input.requesterUserId

    return this.service.getAnalyticsRaw(input.client, {
      cutDateFrom: input.from,
      cutDateTo: input.to,
      userId: scopedUserId,
    })
  }
}
