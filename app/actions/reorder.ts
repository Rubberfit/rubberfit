"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveService, resolveUseCase } from "@/di/resolve"
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
import type { MaterialType as LegacyMaterialType } from "@/src/infrastructure/models/supabase"
import type { Supplier as LegacySupplier } from "@/src/infrastructure/models/supabase"
import type { ReorderRule } from "@/src/entities/reorder-rule"
import type { IReorderService } from "@/src/application/services/reorder.service.interface"
import type { IReorderCalculationsService } from "@/src/application/services/reorder-calculations.service.interface"
import type { IOrganizationPreferencesService } from "@/src/application/services/organization-preferences.service.interface"
import { DEFAULT_ORGANIZATION_PREFERENCES } from "@/src/infrastructure/models/organization-preferences"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import {
  MaterialTypeId,
  ProfileId,
  ReorderRuleId,
  SupplierId,
  TenantId,
} from "@/src/entities/value-objects/id"

import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { PurchaseOrder as PurchaseOrderEntity } from "@/src/entities/purchase-order"
import { SQFT_PER_SQM } from "@/src/application/use-cases/purchase-orders/po-input-conversion"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireActiveTenant } from "@/app/server/auth/require-active-tenant"
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

/**
 * Build the legacy `ReorderRuleWithDetails` shape the use-case
 * expects out of entity-typed `ReorderRule` instances. Bulk-fetches
 * material types + active suppliers once, then enriches each rule
 * with `current_stock` via `IReorderCalculationsService`.
 *
 * Suppliers come from `getActiveSuppliers()` — typical tenants have
 * <50 active suppliers, so one fetch is cheaper than per-rule
 * `getSupplierById` round-trips. Inactive supplier references on a
 * rule (rare) fall through with `supplier: undefined`; the use-case
 * resolves them via `materialSupplierService.getPreferredForMaterialType`.
 */
async function assembleRulesWithDetails(
  rules: ReorderRule[]
): Promise<ReorderRuleWithDetails[]> {
  if (rules.length === 0) return []

  const calc = resolveService<IReorderCalculationsService>(TOKENS.IReorderCalculationsService)

  const matIds = [...new Set(rules.map((r) => r.materialTypeId.value))]
  const [materials, activeSuppliers] = await Promise.all([
    materialTypeService.getByIds(matIds),
    supplierService.getActiveSuppliers(),
  ])

  const matById = new Map(materials.map((m) => [m.id.value, m]))
  const supById = new Map(activeSuppliers.map((s) => [s.id.value, s]))

  return Promise.all(
    rules.map(async (r) => {
      const material = matById.get(r.materialTypeId.value)
      const supplierEntity = r.supplierId ? supById.get(r.supplierId.value) : undefined

      // Boundary cast: the use-case reads only `material_type.name` (and
      // `default_cost` with a fallback to 5). The legacy `MaterialType`
      // interface has many other optional fields we don't carry; cast
      // at the boundary rather than propagating them.
      const material_type = material
        ? ({
            id: material.id.value,
            name: material.name,
          } as unknown as LegacyMaterialType)
        : undefined

      // Same boundary cast for supplier: use-case reads only `name`.
      const supplier = supplierEntity
        ? ({
            id: supplierEntity.id.value,
            name: supplierEntity.name,
          } as unknown as LegacySupplier)
        : undefined

      const current_stock = await calc.calculateCurrentStock(r.materialTypeId.value)

      return {
        id: r.id.value,
        // The legacy `ReorderRule` interface still types `user_id` as a
        // required string even though the schema dropped that column.
        // Use empty string at the boundary; the use-case never reads it.
        user_id: "",
        material_type_id: r.materialTypeId.value,
        supplier_id: r.supplierId?.value,
        reorder_point: r.reorderPointSqm,
        reorder_quantity: r.reorderQuantitySqm,
        max_stock_level: r.maxStockLevelSqm ?? undefined,
        lead_time_days: r.leadTimeDays,
        safety_stock_days: r.safetyStockDays,
        auto_reorder: r.autoReorder,
        active: r.isActive,
        notes: r.notes ?? undefined,
        last_triggered_at: r.lastTriggeredAt?.toISOString(),
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
        material_type,
        supplier,
        current_stock,
      } satisfies ReorderRuleWithDetails
    })
  )
}

/**
 * Fetches in-flight POs (any non-terminal status) via the entity-typed
 * service and projects them into the `GenerateReorderSuggestionsUseCase`
 * input shape — snake_case keys + imperial sqft, matching the use-case's
 * legacy-shape contract.
 */
async function fetchPendingPOsForSuggestions(): Promise<
  Array<{ items?: Array<{ material_type_id: string; quantity_sqft: number }> }>
> {
  const poService = resolveService<IPurchaseOrderService>(TOKENS.IPurchaseOrderService)
  const pendingEntities: PurchaseOrderEntity[] = await poService.getByStatuses([
    "draft",
    "pending_approval",
    "approved",
    "ordered",
    "partial_received",
  ])
  return pendingEntities.map((po) => ({
    items: po.items.map((i) => ({
      material_type_id: i.materialTypeId.value,
      quantity_sqft: i.quantitySqm * SQFT_PER_SQM,
    })),
  }))
}

async function buildAuthoritativeReorderData(
  materialTypeIds: string[]
): Promise<AuthoritativeReorderData> {
  if (materialTypeIds.length === 0) {
    return { suggestions: [], reorderRules: [] }
  }

  const reorderService = resolveService<IReorderService>(TOKENS.IReorderService)
  const allRules = await reorderService.getActiveRules()
  const requestedSet = new Set(materialTypeIds)
  const filteredRules = allRules.filter((r) => requestedSet.has(r.materialTypeId.value))
  if (filteredRules.length === 0) {
    return { suggestions: [], reorderRules: [] }
  }

  const rulesWithStock = await assembleRulesWithDetails(filteredRules)

  const pendingPOs = await fetchPendingPOsForSuggestions()

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

  const { suggestions, reorderRules } = await buildAuthoritativeReorderData([parsed.materialTypeId])

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
): Promise<ReorderRule> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const subscription = await requireActiveSubscription(actor)
  requirePermission(actor, "manageRolls")
  requireActiveTenant(actor)
  const parsed = createReorderRuleInputSchema.parse(input)

  // Reorder point comes in sqft (caller-facing units); convert to sqm
  // when handing off to the entity-typed service. Seeding from org
  // prefs also reads in sqft so the post-seed invariant below stays
  // unit-consistent with caller input.
  const reorderPointSqft =
    parsed.reorder_point ??
    (await loadLowStockThresholdSqftSeed(subscription.organizationId, actor.id))

  // The Zod `.refine()` runs against input only; once seeding fills
  // in `reorder_point`, re-validate the invariant so a high org-level
  // seed can't land alongside a low caller-supplied `max_stock_level`.
  // Throw a `ZodError` on `max_stock_level` (matching the input-time
  // refine's shape) so client forms can map both rejection paths to
  // the same field-level error display. Sigilix PR #269 catch.
  if (parsed.max_stock_level !== undefined && parsed.max_stock_level < reorderPointSqft) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["max_stock_level"],
        message: "Max stock level must be greater than or equal to the reorder point",
      },
    ])
  }

  const reorderService = resolveService<IReorderService>(TOKENS.IReorderService)
  const rule = await reorderService.createRule({
    id: ReorderRuleId.fromPersistence(crypto.randomUUID()),
    tenantId: TenantId.fromPersistence(actor.activeTenantId),
    materialTypeId: MaterialTypeId.fromPersistence(parsed.material_type_id),
    supplierId: parsed.supplier_id ? SupplierId.fromPersistence(parsed.supplier_id) : null,
    reorderPointSqm: reorderPointSqft / SQFT_PER_SQM,
    reorderQuantitySqm: parsed.reorder_quantity / SQFT_PER_SQM,
    maxStockLevelSqm:
      parsed.max_stock_level !== undefined ? parsed.max_stock_level / SQFT_PER_SQM : null,
    leadTimeDays: parsed.lead_time_days,
    safetyStockDays: parsed.safety_stock_days ?? 3,
    autoReorder: parsed.auto_reorder ?? false,
    notes: parsed.notes ?? null,
    actor: ProfileId.fromPersistence(actor.id),
  })

  revalidatePath(REORDER_PATH)
  return rule
}

/**
 * Reads the workspace default low-stock threshold (sqft) from
 * `tenant_settings`. Caller converts sqft → sqm at the entity-typed
 * service boundary. Best-effort: a failed lookup falls back to the
 * model default so create still succeeds.
 */
async function loadLowStockThresholdSqftSeed(
  organizationId: string,
  actorId: string
): Promise<number> {
  try {
    const prefsService = resolveService<IOrganizationPreferencesService>(
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

  const reorderService = resolveService<IReorderService>(TOKENS.IReorderService)
  const allRules = await reorderService.getActiveRules()
  if (allRules.length === 0) return []

  const rulesWithStock = await assembleRulesWithDetails(allRules)

  const pendingPOs = await fetchPendingPOsForSuggestions()

  const generateUseCase = resolveUseCase<IGenerateReorderSuggestionsUseCase>(
    TOKENS.IGenerateReorderSuggestionsUseCase
  )
  return generateUseCase.execute({ rules: rulesWithStock, pendingPOs })
}

/**
 * Batched per-material current-stock lookup. The reorder dashboard's
 * client-side fetcher calls this with the rule list's material IDs to
 * paint per-rule stock indicators in the rules table — one round-trip
 * instead of N. Permission-gated to match the rest of the surface.
 */
export async function getCurrentStockByMaterials(
  materialTypeIds: string[]
): Promise<Record<string, number>> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")
  if (materialTypeIds.length === 0) return {}

  const calc = resolveService<IReorderCalculationsService>(TOKENS.IReorderCalculationsService)
  const uniqueIds = [...new Set(materialTypeIds)]
  const entries = await Promise.all(
    uniqueIds.map(async (id) => [id, await calc.calculateCurrentStock(id)] as const)
  )
  return Object.fromEntries(entries)
}
