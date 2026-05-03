"use server"

import { revalidatePath } from "next/cache"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type {
  CreateReorderPurchaseOrderInput,
  CreateReorderPurchaseOrderResult,
  ICreateReorderPurchaseOrderUseCase,
} from "@/src/application/use-cases/reorder/create-reorder-purchase-order.use-case"
import type {
  GenerateReorderSuggestionsInput,
  IGenerateReorderSuggestionsUseCase,
  ReorderSuggestionOutput,
} from "@/src/application/use-cases/reorder/generate-reorder-suggestions.use-case"

import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requirePermission } from "@/app/server/auth/require-permission"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

const REORDER_PATH = "/dashboard/inventory/reorder"
const PO_LIST_PATH = "/dashboard/inventory/purchase-orders"

export async function createReorderPurchaseOrder(
  input: Omit<CreateReorderPurchaseOrderInput, "actor">
): Promise<CreateReorderPurchaseOrderResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")

  const useCase = resolveUseCase<ICreateReorderPurchaseOrderUseCase>(
    TOKENS.ICreateReorderPurchaseOrderUseCase
  )
  const result = await useCase.execute({ ...input, actor })
  revalidatePath(REORDER_PATH)
  revalidatePath(PO_LIST_PATH)
  return result
}

/**
 * Read-only — no `actor` field on the use-case input. Still requires
 * authentication + permission so unauthorized callers can't enumerate
 * stock levels and supplier preferences via a hash-callable RPC.
 */
export async function generateReorderSuggestions(
  input: GenerateReorderSuggestionsInput
): Promise<ReorderSuggestionOutput[]> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")

  const useCase = resolveUseCase<IGenerateReorderSuggestionsUseCase>(
    TOKENS.IGenerateReorderSuggestionsUseCase
  )
  return useCase.execute(input)
}
