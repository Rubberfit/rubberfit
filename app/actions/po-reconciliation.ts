"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type {
  IReconcilePendingApplyUseCase,
  ReconcilePendingApplyResult,
} from "@/src/application/use-cases/purchase-orders/reconcile-pending-apply.use-case"
import type {
  IReconcilePendingRollCreationUseCase,
  ReconcilePendingRollCreationOutcome,
} from "@/src/application/use-cases/purchase-orders/reconcile-pending-roll-creation.use-case"

import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requirePermission } from "@/app/server/auth/require-permission"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

/**
 * Server-action wrappers for the 7c-2 admin reconcile use-cases. Both
 * actions gate on `reconcileReceipts` (admin-only) and revalidate the
 * /dashboard/admin/inventory/po-reconciliation page so the views' rows
 * re-fetch after a successful reconcile.
 *
 * Like all action files, this is the security boundary — action IDs ship
 * in the client bundle and are callable by hash, so the auth + permission
 * + parse checks here are the only thing standing between the use-case
 * and a malicious client.
 */

const RECONCILE_PATH = "/dashboard/admin/inventory/po-reconciliation"

const reconcileInputSchema = z.object({
  receiptId: z.string().uuid({ message: "Invalid receiptId" }),
})

export type ReconcileActionInput = z.input<typeof reconcileInputSchema>

export async function reconcilePendingApply(
  input: ReconcileActionInput
): Promise<ReconcilePendingApplyResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "reconcileReceipts")
  const parsed = reconcileInputSchema.parse(input)

  const useCase = resolveUseCase<IReconcilePendingApplyUseCase>(
    TOKENS.IReconcilePendingApplyUseCase
  )
  const result = await useCase.execute({ ...parsed, actor })
  revalidatePath(RECONCILE_PATH)
  return result
}

export async function reconcilePendingRollCreation(
  input: ReconcileActionInput
): Promise<ReconcilePendingRollCreationOutcome> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "reconcileReceipts")
  const parsed = reconcileInputSchema.parse(input)

  const useCase = resolveUseCase<IReconcilePendingRollCreationUseCase>(
    TOKENS.IReconcilePendingRollCreationUseCase
  )
  const result = await useCase.execute({ ...parsed, actor })
  revalidatePath(RECONCILE_PATH)
  return result
}
