"use server"

import { makeAdminClient } from "@/app/api/_lib/supabase-server"
import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"
import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type { IGetCutAnalyticsUseCase } from "@/src/application/use-cases/cut-history/get-cut-analytics.use-case"
import type { IListCutHistoryUseCase } from "@/src/application/use-cases/cut-history/list-cut-history.use-case"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

/**
 * Server-side facade over the cut-history analytics + listing use-cases
 * so client components on the dashboard can read cut data without
 * resolving DI or talking to Supabase directly. Replaces the read paths
 * the retired `legacyCutService` used to provide. Both use-cases
 * internally enforce privilege scoping — non-privileged callers see
 * only their own rows.
 *
 * `makeAdminClient()` is used because privileged roles
 * (admin/manager/supervisor) need to read across users; the use-case
 * resolves the right `userId` scope before issuing the query. Matches
 * the pattern in `app/api/analytics/cut-history/route.ts`.
 */

function adminClientOrThrow() {
  const db = makeAdminClient()
  if (!db) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set; cut analytics cannot run on this deployment"
    )
  }
  return db
}

export async function fetchCutsInRange(from: Date, to: Date | null): Promise<CutHistory[]> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  const db = adminClientOrThrow()
  const useCase = resolveUseCase<IGetCutAnalyticsUseCase>(TOKENS.IGetCutAnalyticsUseCase)
  return useCase.execute({
    client: db,
    from: from.toISOString(),
    to: to ? to.toISOString() : null,
    requesterUserId: actor.id,
    requesterRoles: actor.roles,
    filterUserId: null,
  })
}

export async function fetchRecentCuts(limit: number): Promise<CutHistory[]> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  const db = adminClientOrThrow()
  const useCase = resolveUseCase<IListCutHistoryUseCase>(TOKENS.IListCutHistoryUseCase)
  const { data } = await useCase.execute({
    client: db,
    page: 1,
    limit,
    from: null,
    to: null,
    filterUserId: null,
    requesterUserId: actor.id,
    requesterRoles: actor.roles,
  })
  return data
}
