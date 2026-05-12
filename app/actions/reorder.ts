"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type {
  CreateReorderPurchaseOrderResult,
  ICreateReorderPurchaseOrderUseCase,
} from "@/src/application/use-cases/reorder/create-reorder-purchase-order.use-case"
import type {
  CreateBulkReorderPurchaseOrderResult,
  ICreateBulkReorderPurchaseOrderUseCase,
} from "@/src/application/use-cases/reorder/create-bulk-reorder-purchase-order.use-case"
import type {
  IGenerateReorderSuggestionsUseCase,
  ReorderSuggestionOutput,
} from "@/src/application/use-cases/reorder/generate-reorder-suggestions.use-case"
import type { ReorderRuleWithDetails } from "@/src/infrastructure/models/supabase"

import { reorderService } from "@/src/infrastructure/services/reorderService"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"

import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requirePermission } from "@/app/server/auth/require-permission"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

const REORDER_PATH = "/dashboard/inventory/reorder"
const PO_LIST_PATH = "/dashboard/inventory/purchase-orders"

// ── Authority model ─────────────────────────────────────────────────────
//
// Earlier rev of these actions accepted client-supplied
// `suggestion` / `suggestions` / `reorderRules` payloads and forwarded
// them to the create use-cases. A `manageRolls` user could edit
// `estimatedCost` / `suggestedQuantity` in devtools and produce a PO
// with whatever totals they wanted (Steven acknowledged this on PR
// #177 as "real authority gap, heavy lift"). The action layer is the
// only place we can enforce the contract because actions ship in the
// client bundle and are RPC-callable by hash.
//
// Fix: the client surface is now just `materialTypeId(s)`. The server
// fetches reorder rules, attaches current stock, fetches pending POs,
// runs the generate-suggestions use-case (which reads
// material_type.default_cost and applies EOQ + safety-stock + pending
// adjustment), and forwards those server-computed values to the bulk
// or single create use-case. Whatever the UI displayed is irrelevant
// at submit time — there's a small TOCTOU window where the operator
// sees stale numbers, but the actual PO matches authoritative state.
//
// Read-only `generateReorderSuggestions` is the same shape: no client
// input. UI calls it, server fetches and returns. The previous
// rules-passthrough payload is gone — the client has no way to forge
// rule contents.

// ── Schemas ────────────────────────────────────────────────────────────

const uuid = z.string().uuid({ message: "Invalid id" })

const createReorderPurchaseOrderInputSchema = z.object({
  materialTypeId: uuid,
})

const createBulkReorderPurchaseOrderInputSchema = z.object({
  materialTypeIds: z.array(uuid).min(1, "Select at least one material to reorder"),
})

export type CreateReorderPurchaseOrderActionInput = z.input<
  typeof createReorderPurchaseOrderInputSchema
>
export type CreateBulkReorderPurchaseOrderActionInput = z.input<
  typeof createBulkReorderPurchaseOrderInputSchema
>

// ── Server-side data sourcing ──────────────────────────────────────────
//
// Mirrors the client-side `reorder-data-fetcher.ts` flow but runs
// server-side: rules → attach current_stock → fetch pending POs →
// run generate-suggestions use-case → filter to selected IDs.
//
// Returned `reorderRules` is the same `rulesWithStock` array that
// produced the suggestions, so the create use-case sees a consistent
// snapshot — the same rule rows it'd see if it re-fetched.

interface AuthoritativeReorderData {
  suggestions: ReorderSuggestionOutput[]
  reorderRules: ReorderRuleWithDetails[]
}

async function buildAuthoritativeReorderData(
  materialTypeIds: string[]
): Promise<AuthoritativeReorderData> {
  if (materialTypeIds.length === 0) {
    return { suggestions: [], reorderRules: [] }
  }

  const allRules = await reorderService.getActiveReorderRules()
  const requestedSet = new Set(materialTypeIds)
  const filteredRules = allRules.filter((r) => requestedSet.has(r.material_type_id))
  if (filteredRules.length === 0) {
    return { suggestions: [], reorderRules: [] }
  }

  const rulesWithStock = await Promise.all(
    filteredRules.map(async (r) => ({
      ...r,
      current_stock: await reorderService.calculateCurrentStock(r.material_type_id),
    }))
  )

  const pendingPOs = await purchaseOrderService.getPurchaseOrdersByStatuses([
    "draft",
    "pending",
    "approved",
    "ordered",
  ])

  const generateUseCase = resolveUseCase<IGenerateReorderSuggestionsUseCase>(
    TOKENS.IGenerateReorderSuggestionsUseCase
  )
  const suggestions = await generateUseCase.execute({ rules: rulesWithStock, pendingPOs })

  // The generator may produce suggestions for rules where stock is at
  // or above the reorder point — those are dropped here too. Filter to
  // the requested set in case the generator added unexpected entries
  // (defense-in-depth — the generator currently iterates only the
  // input rules, but the filter is cheap insurance).
  const filteredSuggestions = suggestions.filter((s) => requestedSet.has(s.materialTypeId))

  return { suggestions: filteredSuggestions, reorderRules: rulesWithStock }
}

// ── Actions ────────────────────────────────────────────────────────────

export async function createReorderPurchaseOrder(
  input: CreateReorderPurchaseOrderActionInput
): Promise<CreateReorderPurchaseOrderResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")
  const parsed = createReorderPurchaseOrderInputSchema.parse(input)

  const { suggestions, reorderRules } = await buildAuthoritativeReorderData([
    parsed.materialTypeId,
  ])

  // No suggestion produced — material is above reorder point, has no
  // active rule, or has no resolvable supplier. Match the previous
  // single-PO use-case behavior of throwing rather than returning a
  // partial-failure shape (the action surface is single-result by
  // design — the bulk action handles partial-failure).
  if (suggestions.length === 0) {
    throw new Error(
      "No reorder needed for this material, or no supplier is configured. Check the reorder rule and supplier preference."
    )
  }

  const useCase = resolveUseCase<ICreateReorderPurchaseOrderUseCase>(
    TOKENS.ICreateReorderPurchaseOrderUseCase
  )
  const result = await useCase.execute({
    suggestion: suggestions[0],
    reorderRules,
    actor,
  })
  revalidatePath(REORDER_PATH)
  revalidatePath(PO_LIST_PATH)
  return result
}

/**
 * Bulk variant: groups by supplier, emits one PO per supplier with
 * multiple line items. Server-regenerates suggestions from the
 * supplied `materialTypeIds` — see "Authority model" above.
 */
export async function createBulkReorderPurchaseOrder(
  input: CreateBulkReorderPurchaseOrderActionInput
): Promise<CreateBulkReorderPurchaseOrderResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")
  const parsed = createBulkReorderPurchaseOrderInputSchema.parse(input)

  const { suggestions, reorderRules } = await buildAuthoritativeReorderData(parsed.materialTypeIds)

  if (suggestions.length === 0) {
    return { purchaseOrders: [], skipped: [] }
  }

  const useCase = resolveUseCase<ICreateBulkReorderPurchaseOrderUseCase>(
    TOKENS.ICreateBulkReorderPurchaseOrderUseCase
  )
  const result = await useCase.execute({ suggestions, reorderRules, actor })

  if (result.purchaseOrders.length > 0) {
    revalidatePath(REORDER_PATH)
    revalidatePath(PO_LIST_PATH)
  }
  return result
}

/**
 * Read-only — server fetches rules + pending POs and runs the
 * generate-suggestions use-case. No client input. Still requires
 * authentication + permission so unauthorized callers can't enumerate
 * stock levels and supplier preferences via a hash-callable RPC.
 */
export async function generateReorderSuggestions(): Promise<ReorderSuggestionOutput[]> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")

  const allRules = await reorderService.getActiveReorderRules()
  if (allRules.length === 0) return []

  const rulesWithStock = await Promise.all(
    allRules.map(async (r) => ({
      ...r,
      current_stock: await reorderService.calculateCurrentStock(r.material_type_id),
    }))
  )

  const pendingPOs = await purchaseOrderService.getPurchaseOrdersByStatuses([
    "draft",
    "pending",
    "approved",
    "ordered",
  ])

  const generateUseCase = resolveUseCase<IGenerateReorderSuggestionsUseCase>(
    TOKENS.IGenerateReorderSuggestionsUseCase
  )
  return generateUseCase.execute({ rules: rulesWithStock, pendingPOs })
}
