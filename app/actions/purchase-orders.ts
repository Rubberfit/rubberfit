"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveService, resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type {
  CreatePurchaseOrderResult,
  ICreatePurchaseOrderUseCase,
} from "@/src/application/use-cases/purchase-orders/create-purchase-order.use-case"
import type {
  UpdatePurchaseOrderResult,
  IUpdatePurchaseOrderUseCase,
} from "@/src/application/use-cases/purchase-orders/update-purchase-order.use-case"
import type { IApprovePurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/approve-purchase-order.use-case"
import type { IRejectPurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/reject-purchase-order.use-case"
import type { IReceivePurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/receive-purchase-order.use-case"
import type { POReceiptResult } from "@/src/application/services/purchase-order-receipt.types"
import type { PurchaseOrder } from "@/src/infrastructure/models/supabase"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"
import { purchaseOrderEntityToLegacyWithItems } from "@/src/infrastructure/services/po-entity-to-legacy"
import { supplierService } from "@/src/infrastructure/services/supplierService"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
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
 *   3. Zod-parses the input. TypeScript types vanish at runtime — a
 *      hash-callable action receives whatever the client serializes,
 *      and a malicious client can serialize anything. Schemas mirror
 *      each use-case's input shape (minus `actor`); extra keys are
 *      stripped before forwarding so they can't smuggle past the
 *      use-case into a service write.
 *   4. Resolves the use-case from the DI container and executes it
 *      with `actor` threaded through.
 *   5. Calls `revalidatePath` so any RSC reading the PO list re-fetches.
 *      Client-side React Query callers also call `invalidateQueries`
 *      after the action returns.
 *
 * Action IDs ship in the client bundle and are callable by hash, so
 * the auth + permission + parse checks here are the security boundary —
 * `proxy.ts` does NOT see action invocations.
 *
 * `manageRolls` matches how the `/dashboard/inventory/purchase-orders`
 * route is gated in `ROUTE_PERMISSIONS`. When finer-grained tokens
 * (e.g., `purchaseOrders.approve`) are introduced, swap them in here.
 */

// ── Schemas ────────────────────────────────────────────────────────────

const uuid = z.string().uuid({ message: "Invalid id" })

// Date strings come from `<input type="date">` (always emits ISO
// `YYYY-MM-DD`) or can be empty when the form field is blank — we
// accept either rather than forcing the client to send `undefined`.
// The use-case treats empty + undefined identically. Refine catches
// values like `"tomorrow"` or `"abc"` that the form would never emit
// but a malicious client could; rejecting at parse keeps the failure
// mode local rather than letting a bad value propagate to the DB.
const dateString = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Invalid date")
  .optional()

const purchaseOrderItemSchema = z.object({
  materialTypeId: uuid,
  description: z.string().trim().max(500).optional(),
  quantitySqft: z.number().positive("Quantity must be greater than 0"),
  unitCost: z.number().min(0, "Unit cost cannot be negative"),
  width: z.number().positive().optional(),
  thickness: z.number().positive().optional(),
  color: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
})

const createPurchaseOrderSchema = z.object({
  supplierId: uuid,
  requestedDeliveryDate: dateString,
  paymentTerms: z.string().trim().max(200).optional(),
  shippingAddress: z.string().trim().max(1000).optional(),
  billingAddress: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
  // `selectedSupplier?.default_shipping_cost` resolves to `null` (not
  // `undefined`) when the joined supplier row has no default — accept
  // both. The use-case applies a 50.0 fallback either way.
  shippingCost: z.number().min(0).nullish(),
  jobId: uuid.optional(),
  items: z.array(purchaseOrderItemSchema).min(1, "At least one item is required"),
})

const updatePurchaseOrderSchema = createPurchaseOrderSchema.extend({
  purchaseOrderId: uuid,
})

const approvePurchaseOrderSchema = z.object({
  purchaseOrderId: uuid,
})

const rejectPurchaseOrderSchema = z.object({
  purchaseOrderId: uuid,
  reason: z.string().trim().max(2000).optional(),
})

// `rollData?: Partial<Roll>` — the receive-flow caller may suggest
// roll-creation defaults. We accept the human-set subset (material,
// dimensions, notes, etc.) and explicitly reject server/DB-managed
// fields (`id`, `user_id`, `part_number`, `parent_roll_id`, `is_offcut`)
// so a malicious client can't impersonate offcut lineage or stomp
// audit fields.
const rollDataSchema = z.object({
  material_type: z.string().trim().max(100).optional(),
  material_type_id: uuid.optional(),
  width: z.number().positive().optional(),
  length: z.number().positive().optional(),
  thickness: z.number().positive().optional(),
  color: z.string().trim().max(100).optional(),
  location: z.string().trim().max(200).optional(),
  supplier: z.string().trim().max(200).optional(),
  cost_per_sqft: z.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional(),
  date_received: dateString,
})

const poReceiptItemSchema = z.object({
  itemId: uuid,
  // `.positive()` (not `.min(0)`): receiving 0 of an item is
  // semantically "don't include the item in the receive payload."
  // Mirrors `purchaseOrderItemSchema.quantitySqft` above. (sigilix
  // follow-up on PR #177.)
  quantityReceived: z.number().positive("Quantity received must be greater than 0"),
  rollData: rollDataSchema.optional(),
})

// `receivedBy` is intentionally NOT on this schema. Receipt attribution
// is sourced from `actor.id` server-side — letting a client supply a
// uuid would attribute the receive to someone else (and the
// quantity-update half of the operation runs before RLS catches the
// forged id on the roll insert). Daniel review on PR #177.
//
// `idempotencyKey` (step 7c-1): client-supplied UUID per submission.
// Required — the use-case anchors the (itemId, idempotencyKey) UNIQUE
// row in `po_item_receipts` for every item in the batch, so a retry of
// the same submission collides on the constraint and the service
// reports the item as `alreadyApplied`. Same key + same items =
// no-op. The client regenerates the key on form mount, on any field
// change, and after a successful response (see po-action-handlers).
const receivePurchaseOrderSchema = z.object({
  purchaseOrderId: uuid,
  idempotencyKey: uuid,
  items: z.array(poReceiptItemSchema).min(1, "At least one item is required"),
})

// ── Action public input types (derive from schemas, NOT use-case inputs) ──
//
// `z.input<...>` is what the client serializes (pre-parse), which is
// the actual contract callers see. Keeping these schema-derived
// instead of `Omit<UseCaseInput, "actor">` ensures the runtime parse
// shape is the source of truth.

export type CreatePurchaseOrderActionInput = z.input<typeof createPurchaseOrderSchema>
export type UpdatePurchaseOrderActionInput = z.input<typeof updatePurchaseOrderSchema>
export type ApprovePurchaseOrderActionInput = z.input<typeof approvePurchaseOrderSchema>
export type RejectPurchaseOrderActionInput = z.input<typeof rejectPurchaseOrderSchema>
export type ReceivePurchaseOrderActionInput = z.input<typeof receivePurchaseOrderSchema>

// ── Actions ────────────────────────────────────────────────────────────

export async function createPurchaseOrder(
  input: CreatePurchaseOrderActionInput
): Promise<CreatePurchaseOrderResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  requirePermission(actor, "manageRolls")
  const parsed = createPurchaseOrderSchema.parse(input)

  const useCase = resolveUseCase<ICreatePurchaseOrderUseCase>(TOKENS.ICreatePurchaseOrderUseCase)
  const result = await useCase.execute({
    ...parsed,
    shippingCost: parsed.shippingCost ?? undefined,
    actor,
  })
  revalidatePath(PO_LIST_PATH)
  return result
}

export async function updatePurchaseOrder(
  input: UpdatePurchaseOrderActionInput
): Promise<UpdatePurchaseOrderResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  requirePermission(actor, "manageRolls")
  const parsed = updatePurchaseOrderSchema.parse(input)

  const useCase = resolveUseCase<IUpdatePurchaseOrderUseCase>(TOKENS.IUpdatePurchaseOrderUseCase)
  const result = await useCase.execute({
    ...parsed,
    shippingCost: parsed.shippingCost ?? undefined,
    actor,
  })
  revalidatePath(PO_LIST_PATH)
  return result
}

export async function approvePurchaseOrder(
  input: ApprovePurchaseOrderActionInput
): Promise<PurchaseOrder> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  requirePermission(actor, "manageRolls")
  const parsed = approvePurchaseOrderSchema.parse(input)

  const useCase = resolveUseCase<IApprovePurchaseOrderUseCase>(TOKENS.IApprovePurchaseOrderUseCase)
  const result = await useCase.execute({ ...parsed, actor })
  revalidatePath(PO_LIST_PATH)
  return result
}

export async function rejectPurchaseOrder(
  input: RejectPurchaseOrderActionInput
): Promise<PurchaseOrder> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  requirePermission(actor, "manageRolls")
  const parsed = rejectPurchaseOrderSchema.parse(input)

  const useCase = resolveUseCase<IRejectPurchaseOrderUseCase>(TOKENS.IRejectPurchaseOrderUseCase)
  const result = await useCase.execute({ ...parsed, actor })
  revalidatePath(PO_LIST_PATH)
  return result
}

export async function receivePurchaseOrder(
  input: ReceivePurchaseOrderActionInput
): Promise<POReceiptResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  requirePermission(actor, "manageRolls")
  const parsed = receivePurchaseOrderSchema.parse(input)

  const useCase = resolveUseCase<IReceivePurchaseOrderUseCase>(TOKENS.IReceivePurchaseOrderUseCase)
  const result = await useCase.execute({ ...parsed, actor })
  revalidatePath(PO_LIST_PATH)
  return result
}

/**
 * Read-only — fetches a single PO via the entity-typed service and
 * projects it back to the legacy `PurchaseOrderWithDetails` shape
 * (snake_case + items array) the admin pages still consume. Replaces
 * the legacy `getPurchaseOrderById` shim call.
 *
 * Supplier name is not joined here — the pages already separately
 * fetch a `SupplierSnapshot[]` and look up by `supplier_id`.
 */
export async function getPurchaseOrderByIdAction(
  id: string
): Promise<PurchaseOrderWithDetails> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")
  const svc = resolveService<IPurchaseOrderService>(TOKENS.IPurchaseOrderService)
  const po = await svc.getById(id)
  const supplier = await supplierService.getSupplierById(po.supplierId.value).catch(() => null)
  return purchaseOrderEntityToLegacyWithItems(
    po,
    supplier ? { id: supplier.id.value, name: supplier.name } : null
  )
}

/**
 * Read-only — fetches all non-deleted POs via the entity-typed
 * service and returns the legacy `PurchaseOrderWithDetails[]` shape.
 * Bulk-fetches active suppliers once for the joined `supplier?.name`
 * each PO row carries (the list page filter searches on it).
 * Replaces the legacy `getAllPurchaseOrders` shim call.
 */
/**
 * FK pre-flight: does any non-deleted, non-cancelled PO item reference
 * `materialTypeId`? Used by the material-types catalog page's delete
 * dialog, which is a client component (can't resolve the entity-typed
 * service via DI directly).
 */
export async function existsActiveItemsByMaterialTypeAction(
  materialTypeId: string
): Promise<boolean> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageMaterialTypes")
  const svc = resolveService<IPurchaseOrderService>(TOKENS.IPurchaseOrderService)
  return svc.existsActiveItemsByMaterialType(materialTypeId)
}

export async function listPurchaseOrdersAction(): Promise<PurchaseOrderWithDetails[]> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")
  const svc = resolveService<IPurchaseOrderService>(TOKENS.IPurchaseOrderService)
  const [pos, suppliers] = await Promise.all([svc.getActive(), supplierService.getActiveSuppliers()])
  const supplierById = new Map(suppliers.map((s) => [s.id.value, s]))
  return pos.map((po) => {
    const sup = supplierById.get(po.supplierId.value)
    return purchaseOrderEntityToLegacyWithItems(
      po,
      sup ? { id: sup.id.value, name: sup.name } : null
    )
  })
}
