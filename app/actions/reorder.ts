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
import type { IOrganizationPreferencesService } from "@/src/application/services/organization-preferences.service.interface"
import { DEFAULT_ORGANIZATION_PREFERENCES } from "@/src/infrastructure/models/organization-preferences"

import { reorderService } from "@/src/infrastructure/services/reorderService"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
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

const nonNegativeNumber = z.number().min(0, "Must be 0 or greater")
const positiveNumber = z.number().gt(0, "Must be greater than 0")

const createReorderRuleInputSchema = z
  .object({
    material_type_id: uuid,
    supplier_id: uuid.optional(),
    /**
     * Optional at the action boundary: when omitted the action seeds
     * from `organization_preferences.lowStockThresholdSqft`. Explicit
     * `0` is preserved (operator "no alert" override) via `??`.
     */
    reorder_point: nonNegativeNumber.optional(),
    reorder_quantity: positiveNumber,
    max_stock_level: nonNegativeNumber.optional(),
    lead_time_days: z.number().int().min(0, "Lead time must be 0 or greater"),
    safety_stock_days: z.number().int().min(0, "Safety stock must be 0 or greater").optional(),
    auto_reorder: z.boolean().optional(),
    active: z.boolean().optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine(
    (data) =>
      data.max_stock_level === undefined ||
      data.reorder_point === undefined ||
      data.max_stock_level >= data.reorder_point,
    {
      path: ["max_stock_level"],
      message: "Max stock level must be greater than or equal to the reorder point",
    }
  )

export type CreateReorderPurchaseOrderActionInput = z.input<
  typeof createReorderPurchaseOrderInputSchema
>
export type CreateBulkReorderPurchaseOrderActionInput = z.input<
  typeof createBulkReorderPurchaseOrderInputSchema
>
export type CreateReorderRuleActionInput = z.input<typeof createReorderRuleInputSchema>

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
  await requireActiveSubscription(actor)
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
  await requireActiveSubscription(actor)
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
 * Create a reorder rule. `reorder_point` is optional on the action
 * boundary — when the caller omits it, we seed from the org's
 * `lowStockThresholdSqft`. Explicit values (including `0`) flow
 * through unchanged via `??`. Auth + RBAC enforced server-side so
 * the form can't bypass via the RPC hash.
 */
export async function createReorderRule(
  input: CreateReorderRuleActionInput
): Promise<ReorderRuleWithDetails> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const subscription = await requireActiveSubscription(actor)
  requirePermission(actor, "manageRolls")
  const parsed = createReorderRuleInputSchema.parse(input)

  const reorderPoint =
    parsed.reorder_point ??
    (await loadLowStockThresholdSeed(subscription.organizationId, actor.id))

  // The Zod `.refine()` runs against the input; once seeding fills
  // in `reorder_point`, re-validate the invariant so a high org-level
  // seed cannot land alongside a low caller-supplied `max_stock_level`.
  if (parsed.max_stock_level !== undefined && parsed.max_stock_level < reorderPoint) {
    throw new Error("Max stock level must be greater than or equal to the reorder point")
  }

  const result = await reorderService.createReorderRule(
    {
      material_type_id: parsed.material_type_id,
      supplier_id: parsed.supplier_id,
      reorder_point: reorderPoint,
      reorder_quantity: parsed.reorder_quantity,
      max_stock_level: parsed.max_stock_level,
      lead_time_days: parsed.lead_time_days,
      safety_stock_days: parsed.safety_stock_days ?? 3,
      auto_reorder: parsed.auto_reorder ?? false,
      active: parsed.active ?? true,
      notes: parsed.notes,
    },
    actor.id
  )

  revalidatePath(REORDER_PATH)
  return result
}

/**
 * Mirrors the materials-action helper. Best-effort: a failed prefs
 * lookup seeds the model default so create still succeeds. Log
 * carries `organizationId` + `actorId` for debugability.
 */
async function loadLowStockThresholdSeed(
  organizationId: string,
  actorId: string
): Promise<number> {
  try {
    const prefsService = resolveUseCase<IOrganizationPreferencesService>(
      TOKENS.IOrganizationPreferencesService
    )
    const prefs = await prefsService.getForOrganization(organizationId)
    return prefs.lowStockThresholdSqft
  } catch (error) {
    console.error(
      `[reorder] org-prefs threshold seed lookup failed (organizationId=${organizationId} actorId=${actorId}):`,
      error
    )
    return DEFAULT_ORGANIZATION_PREFERENCES.lowStockThresholdSqft
  }
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
  await requireActiveSubscription(actor)
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
