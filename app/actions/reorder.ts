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
// joined columns the use-case reads. The strip/passthrough policy is
// asymmetric on purpose:
//
//   - **Top-level wrappers** (`{ suggestion, reorderRules }`,
//     `{ suggestions, reorderRules }`, `{ rules, pendingPOs }`):
//     default-strip. Closed shapes — no legitimate top-level extras.
//     A client smuggling e.g. `bulkOverride: true` gets it stripped
//     before the use-case sees it.
//   - **`reorderRuleSchema` and its nested objects**: `.passthrough()`.
//     Callers pass full `ReorderRuleWithDetails[]` rows fetched from
//     Supabase (with `user_id`, `lead_time_days`, joined material_type
//     fields, etc.). Encoding every DB column in Zod would couple the
//     action to schema migrations; passthrough preserves the unknown
//     joined columns the use-case actually reads.
//
// We forward the parsed result (not raw `input`) into the use-case,
// so the strip policy is enforced at the action boundary rather than
// trusting the use-case body to extract known fields. (Earlier rev
// passed raw `input`; Sigilix flagged that as a defense-in-depth gap
// — a future use-case spread would silently re-introduce smuggling.)
//
// TS public types stay `Omit<UseCaseInput, "actor">` because callers
// pass DB-row-shaped objects; the runtime cast on the parsed object
// bridges Zod's passthrough output type (with `[k: string]: unknown`
// index signatures from `.passthrough()`) and the explicit nullable
// columns on `ReorderRuleWithDetails`. The shape is identical at
// runtime — the cast is purely a TS ergonomics tax.

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
  // Forward the parsed result (default-strip on the wrapper, passthrough
  // on rules) so smuggled top-level keys can't reach the use-case.
  // Cast through `unknown` bridges Zod's passthrough output (which
  // doesn't enumerate every column on `ReorderRuleWithDetails`) to the
  // use-case's explicit type. The runtime shape is correct — passthrough
  // preserves the unknown columns the use-case reads.
  const parsed = createReorderPurchaseOrderSchema.parse(input) as unknown as Omit<
    CreateReorderPurchaseOrderInput,
    "actor"
  >

  const useCase = resolveUseCase<ICreateReorderPurchaseOrderUseCase>(
    TOKENS.ICreateReorderPurchaseOrderUseCase
  )
  const result = await useCase.execute({ ...parsed, actor })
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
  const parsed = createBulkReorderPurchaseOrderSchema.parse(input) as unknown as Omit<
    CreateBulkReorderPurchaseOrderInput,
    "actor"
  >

  const useCase = resolveUseCase<ICreateBulkReorderPurchaseOrderUseCase>(
    TOKENS.ICreateBulkReorderPurchaseOrderUseCase
  )
  const result = await useCase.execute({ ...parsed, actor })

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
  const parsed = generateReorderSuggestionsSchema.parse(
    input
  ) as unknown as GenerateReorderSuggestionsInput

  const useCase = resolveUseCase<IGenerateReorderSuggestionsUseCase>(
    TOKENS.IGenerateReorderSuggestionsUseCase
  )
  return useCase.execute(parsed)
}
