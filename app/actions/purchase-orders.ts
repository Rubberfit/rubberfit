"use server"

import { revalidatePath } from "next/cache"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type {
  CreatePurchaseOrderInput,
  CreatePurchaseOrderResult,
  ICreatePurchaseOrderUseCase,
} from "@/src/application/use-cases/purchase-orders/create-purchase-order.use-case"
import type {
  UpdatePurchaseOrderInput,
  UpdatePurchaseOrderResult,
  IUpdatePurchaseOrderUseCase,
} from "@/src/application/use-cases/purchase-orders/update-purchase-order.use-case"
import type { IApprovePurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/approve-purchase-order.use-case"
import type { IRejectPurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/reject-purchase-order.use-case"
import type {
  ReceivePurchaseOrderInput,
  IReceivePurchaseOrderUseCase,
} from "@/src/application/use-cases/purchase-orders/receive-purchase-order.use-case"
import type {
  POReceiptItem,
  POReceiptResult,
} from "@/src/application/services/purchase-order.service.interface"
import type { PurchaseOrder } from "@/src/infrastructure/models/supabase"

import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requirePermission } from "@/app/server/auth/require-permission"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

const PO_LIST_PATH = "/dashboard/inventory/purchase-orders"

/**
 * Server-action wrappers for the 5 purchase-order use-cases.
 *
 * Each action:
 *   1. Resolves the caller via `requireAuthenticatedUser` (throws
 *      `UnauthorizedError` on failure).
 *   2. Enforces RBAC via `requirePermission` (throws `ForbiddenError`).
 *   3. Resolves the use-case from the DI container and executes it
 *      with `actor` threaded through.
 *   4. Calls `revalidatePath` so any RSC reading the PO list re-fetches.
 *      Client-side React Query callers also call `invalidateQueries`
 *      after the action returns.
 *
 * Action IDs ship in the client bundle and are callable by hash, so
 * the auth + permission checks here are the security boundary —
 * `proxy.ts` does NOT see action invocations.
 *
 * `manageRolls` matches how the `/dashboard/inventory/purchase-orders`
 * route is gated in `ROUTE_PERMISSIONS`. When finer-grained tokens
 * (e.g., `purchaseOrders.approve`) are introduced, swap them in here.
 */

export async function createPurchaseOrder(
  input: Omit<CreatePurchaseOrderInput, "actor">
): Promise<CreatePurchaseOrderResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")

  const useCase = resolveUseCase<ICreatePurchaseOrderUseCase>(TOKENS.ICreatePurchaseOrderUseCase)
  const result = await useCase.execute({ ...input, actor })
  revalidatePath(PO_LIST_PATH)
  return result
}

export async function updatePurchaseOrder(
  input: Omit<UpdatePurchaseOrderInput, "actor">
): Promise<UpdatePurchaseOrderResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")

  const useCase = resolveUseCase<IUpdatePurchaseOrderUseCase>(TOKENS.IUpdatePurchaseOrderUseCase)
  const result = await useCase.execute({ ...input, actor })
  revalidatePath(PO_LIST_PATH)
  return result
}

export async function approvePurchaseOrder(input: {
  purchaseOrderId: string
}): Promise<PurchaseOrder> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")

  const useCase = resolveUseCase<IApprovePurchaseOrderUseCase>(TOKENS.IApprovePurchaseOrderUseCase)
  const result = await useCase.execute({ ...input, actor })
  revalidatePath(PO_LIST_PATH)
  return result
}

export async function rejectPurchaseOrder(input: {
  purchaseOrderId: string
  reason?: string
}): Promise<PurchaseOrder> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")

  const useCase = resolveUseCase<IRejectPurchaseOrderUseCase>(TOKENS.IRejectPurchaseOrderUseCase)
  const result = await useCase.execute({ ...input, actor })
  revalidatePath(PO_LIST_PATH)
  return result
}

export async function receivePurchaseOrder(input: {
  purchaseOrderId: string
  items: POReceiptItem[]
  receivedBy?: string
}): Promise<POReceiptResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")

  const useCase = resolveUseCase<IReceivePurchaseOrderUseCase>(TOKENS.IReceivePurchaseOrderUseCase)
  const useCaseInput: ReceivePurchaseOrderInput = { ...input, actor }
  const result = await useCase.execute(useCaseInput)
  revalidatePath(PO_LIST_PATH)
  return result
}
