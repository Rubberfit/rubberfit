"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type {
  CreateReorderPurchaseOrderInput,
  CreateReorderPurchaseOrderResult,
  ICreateReorderPurchaseOrderUseCase,
} from "@/src/application/use-cases/reorder/create-reorder-purchase-order.use-case"
import type {
  CreateBulkReorderPurchaseOrderInput,
  CreateBulkReorderPurchaseOrderResult,
  ICreateBulkReorderPurchaseOrderUseCase,
} from "@/src/application/use-cases/reorder/create-bulk-reorder-purchase-order.use-case"
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

// ── Schemas ────────────────────────────────────────────────────────────
//
// Same security posture as `app/actions/purchase-orders.ts`: every
// hash-callable RPC parses input before forwarding so a malicious
// client can't smuggle malformed values past the action layer.
//
// Reorder-specific wrinkle: `suggestion`s and `reorderRules` are
// composite objects mirroring use-case-output / DB-row shapes, with
// joined columns the use-case ignores. We use `.passthrough()` on
// nested objects so adding a new joined column upstream doesn't break
// the action — strict checks live on the fields the use-case actually
// consumes (`material_type.name`, `material_type.default_cost`, ids,
// numeric ranges).
//
// Why TS public types come from the use-case input, not `z.input<>`:
// callers pass full `ReorderRuleWithDetails[]` rows fetched from
// Supabase (with `user_id`, `lead_time_days`, etc.). The Zod schema
// is intentionally a subset — encoding every DB column would couple
// the action to schema migrations. So the public type stays
// `Omit<UseCaseInput, "actor">` for compile-time alignment with the
// caller; Zod is a runtime tripwire that catches malformed UUIDs,
// missing required fields, and type confusion. The use-case extracts
// known fields and never spreads `input` into a service write, so
// smuggled extras can't reach the DB.

const uuid = z.string().uuid({ message: "Invalid id" })

const reorderSuggestionSchema = z.object({
  materialTypeId: uuid,
  materialName: z.string().trim().min(1).max(200),
  currentStock: z.number().min(0),
  reorderPoint: z.number().min(0),
  suggestedQuantity: z.number().positive(),
  urgencyLevel: z.enum(["critical", "high", "medium", "low"]),
  daysUntilStockout: z.number().min(0),
  supplierId: uuid.optional(),
  supplierName: z.string().trim().max(200).optional(),
  estimatedCost: z.number().min(0),
  pendingQuantity: z.number().min(0).optional(),
})

const reorderRuleSchema = z
  .object({
    id: uuid,
    material_type_id: uuid,
    reorder_point: z.number().min(0),
    reorder_quantity: z.number().min(0),
    current_stock: z.number().min(0).nullable().optional(),
    max_stock_level: z.number().min(0).nullable().optional(),
    safety_stock_days: z.number().min(0).nullable().optional(),
    supplier_id: uuid.nullable().optional(),
    material_type: z
      .object({
        name: z.string(),
        default_cost: z.number().nullable().optional(),
      })
      .passthrough()
      .optional(),
    supplier: z
      .object({
        name: z.string(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

const createReorderPurchaseOrderSchema = z.object({
  suggestion: reorderSuggestionSchema,
  reorderRules: z.array(reorderRuleSchema),
})

const createBulkReorderPurchaseOrderSchema = z.object({
  suggestions: z.array(reorderSuggestionSchema),
  reorderRules: z.array(reorderRuleSchema),
})

const generateReorderSuggestionsSchema = z.object({
  rules: z.array(reorderRuleSchema),
  pendingPOs: z
    .array(
      z.object({
        items: z
          .array(
            z.object({
              material_type_id: uuid,
              quantity_sqft: z.number().min(0),
            })
          )
          .optional(),
      })
    )
    .optional(),
})

// ── Actions ────────────────────────────────────────────────────────────

export async function createReorderPurchaseOrder(
  input: Omit<CreateReorderPurchaseOrderInput, "actor">
): Promise<CreateReorderPurchaseOrderResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")
  // Runtime tripwire — throws on malformed input. Result is discarded
  // because we forward the original `input` (typed as the use-case
  // input) so the use-case sees full DB-row shapes including joined
  // columns Zod's subset doesn't enumerate.
  createReorderPurchaseOrderSchema.parse(input)

  const useCase = resolveUseCase<ICreateReorderPurchaseOrderUseCase>(
    TOKENS.ICreateReorderPurchaseOrderUseCase
  )
  const result = await useCase.execute({ ...input, actor })
  revalidatePath(REORDER_PATH)
  revalidatePath(PO_LIST_PATH)
  return result
}

/**
 * Bulk variant: groups suggestions by supplier and emits one PO per
 * supplier with multiple line items. Uses the real tax service
 * (replacing the previous browser-side hardcoded 8% rate) and mirrors
 * single-PO notification semantics so bulk and single produce
 * consistent reorder-triggered streams.
 *
 * Returns partial results: `purchaseOrders` for successes,
 * `skipped` with stable reason codes for items that didn't make it
 * onto a PO. Throws only on auth / permission / config / parse errors.
 */
export async function createBulkReorderPurchaseOrder(
  input: Omit<CreateBulkReorderPurchaseOrderInput, "actor">
): Promise<CreateBulkReorderPurchaseOrderResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageRolls")
  createBulkReorderPurchaseOrderSchema.parse(input)

  const useCase = resolveUseCase<ICreateBulkReorderPurchaseOrderUseCase>(
    TOKENS.ICreateBulkReorderPurchaseOrderUseCase
  )
  const result = await useCase.execute({ ...input, actor })

  if (result.purchaseOrders.length > 0) {
    revalidatePath(REORDER_PATH)
    revalidatePath(PO_LIST_PATH)
  }
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
  generateReorderSuggestionsSchema.parse(input)

  const useCase = resolveUseCase<IGenerateReorderSuggestionsUseCase>(
    TOKENS.IGenerateReorderSuggestionsUseCase
  )
  return useCase.execute(input)
}
