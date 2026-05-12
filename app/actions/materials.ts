"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requirePermission } from "@/app/server/auth/require-permission"
import { legacyMaterialTypeService as materialTypeService } from "@/src/infrastructure/services/legacyMaterialTypeService"
import { legacyRollService as rollService } from "@/src/infrastructure/services/legacyRollService"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"
import type { MaterialType } from "@/src/infrastructure/models/supabase"

/**
 * Material-type management actions.
 *
 * Pre-action call sites scattered across:
 *   - `/dashboard/settings/materials` (manageMaterialTypes route)
 *   - `/dashboard/inventory/materials/pricing` (managePricing route)
 *   - `/dashboard/inventory/import` (CSV imports)
 *   - the dedicated material import dialog
 *
 * called `materialTypeService.create/update/delete` directly from the
 * browser. The route-level guards on those pages don't cover the
 * service surface — a user could call the service via devtools from
 * any other dashboard route. ASVS V4.2 requires server-side
 * authorization on every operation.
 *
 * Permission policy: all three actions are gated by
 * `manageMaterialTypes` (admin/manager). Today, the route guard on
 * `/dashboard/inventory/materials/pricing` is `managePricing`
 * (admin only), which is meaningfully MORE restrictive — but the
 * settings/materials page (manager-accessible) ALREADY allows cost
 * edits today, so this migration preserves current behavior.
 * Tightening the permission to require `managePricing` for
 * `default_cost` writes specifically is tracked as a follow-up.
 *
 * Trade-off note on `deleteMaterialType`: the page handler does FK
 * pre-flight checks (rolls + PO items) before calling the service so
 * users get a specific "in use by rolls" message instead of a
 * generic FK error. The action preserves that UX by running the
 * same pre-flight checks server-side. Returns a typed result with
 * a stable reason code for the UI to discriminate on.
 */

const MATERIALS_SETTINGS_PATH = "/dashboard/settings/materials"
const MATERIALS_PRICING_PATH = "/dashboard/inventory/materials/pricing"
const MATERIALS_TYPES_PATH = "/dashboard/inventory/materials/types"
const INVENTORY_PATH = "/dashboard/inventory"

function revalidateAllMaterialPaths(): void {
  revalidatePath(MATERIALS_SETTINGS_PATH)
  revalidatePath(MATERIALS_PRICING_PATH)
  revalidatePath(MATERIALS_TYPES_PATH)
  revalidatePath(INVENTORY_PATH)
}

const materialIdSchema = z.string().uuid({ message: "Invalid material id" })
const nonNegativeNumber = z.number().min(0, "Must be 0 or greater")

const createMaterialTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z.string().trim().max(500).optional(),
  default_cost: nonNegativeNumber.optional(),
  min_stock_alert: nonNegativeNumber.optional(),
})

const updateMaterialTypeSchema = z.object({
  id: materialIdSchema,
  name: z.string().trim().min(1, "Name is required").max(100).optional(),
  description: z.string().trim().max(500).optional(),
  default_cost: nonNegativeNumber.optional(),
  min_stock_alert: nonNegativeNumber.optional(),
})

const deleteMaterialTypeSchema = z.object({
  id: materialIdSchema,
})

export type CreateMaterialTypeActionInput = z.input<typeof createMaterialTypeSchema>
export type UpdateMaterialTypeActionInput = z.input<typeof updateMaterialTypeSchema>
export type DeleteMaterialTypeActionInput = z.input<typeof deleteMaterialTypeSchema>

export type DeleteMaterialTypeResult =
  | { ok: true }
  | {
      ok: false
      reason: "not_found" | "in_use_by_rolls" | "in_use_by_purchase_orders" | "delete_failed"
      message: string
    }

export async function createMaterialType(
  input: CreateMaterialTypeActionInput
): Promise<MaterialType> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageMaterialTypes")
  const parsed = createMaterialTypeSchema.parse(input)

  const result = await materialTypeService.create(
    {
      name: parsed.name,
      description: parsed.description ?? "",
      default_cost: parsed.default_cost ?? 0,
      min_stock_alert: parsed.min_stock_alert ?? 0,
    },
    actor.id
  )
  revalidateAllMaterialPaths()
  return result
}

export async function updateMaterialType(
  input: UpdateMaterialTypeActionInput
): Promise<MaterialType> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageMaterialTypes")
  const parsed = updateMaterialTypeSchema.parse(input)

  // Narrow the field surface: only the four editable columns flow
  // through. The legacy `materialTypeService.update` accepts
  // `Partial<MaterialType>`, including `id`, `user_id`, `created_at`,
  // `updated_at` — none of which should be client-controllable.
  const updates: {
    name?: string
    description?: string
    default_cost?: number
    min_stock_alert?: number
  } = {}
  if (parsed.name !== undefined) updates.name = parsed.name
  if (parsed.description !== undefined) updates.description = parsed.description
  if (parsed.default_cost !== undefined) updates.default_cost = parsed.default_cost
  if (parsed.min_stock_alert !== undefined) updates.min_stock_alert = parsed.min_stock_alert

  const result = await materialTypeService.update(parsed.id, updates)
  revalidateAllMaterialPaths()
  return result
}

export async function deleteMaterialType(
  input: DeleteMaterialTypeActionInput
): Promise<DeleteMaterialTypeResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "manageMaterialTypes")
  const parsed = deleteMaterialTypeSchema.parse(input)

  // Resolve the material to get its NAME — `existsByMaterialType`
  // takes a name, not an id, because the rolls table denormalizes
  // material_type as text. Doing the lookup server-side instead of
  // trusting a client-supplied name preserves V4.2 (caller can't
  // rename what they're checking against).
  const [material] = await materialTypeService.getByIds([parsed.id])
  if (!material) {
    return {
      ok: false,
      reason: "not_found",
      message: "Material type not found",
    }
  }

  // Pre-flight FK checks. The DB also has FK constraints, so this is
  // belt-and-suspenders, but the explicit reason code lets the UI
  // surface a more actionable message than a generic "in use" error.
  const hasRolls = await rollService.existsByMaterialType(material.name)
  if (hasRolls) {
    return {
      ok: false,
      reason: "in_use_by_rolls",
      message: "This material is being used by existing rolls",
    }
  }

  const hasPOItems = await purchaseOrderService.existsItemsByMaterialType(parsed.id)
  if (hasPOItems) {
    return {
      ok: false,
      reason: "in_use_by_purchase_orders",
      message: "This material is referenced by existing purchase orders",
    }
  }

  try {
    await materialTypeService.delete(parsed.id)
    revalidateAllMaterialPaths()
    return { ok: true }
  } catch (error) {
    // Log raw error server-side; client gets a stable message.
    console.error("[materials] delete failed:", error)
    // Specifically catch FK constraint errors that slipped past the
    // pre-flight (race window: a roll referencing this material was
    // inserted between the check and the delete).
    const isFkError =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23503"
    return {
      ok: false,
      reason: "delete_failed",
      message: isFkError
        ? "This material is referenced by other records and cannot be deleted"
        : "Could not delete material type",
    }
  }
}
