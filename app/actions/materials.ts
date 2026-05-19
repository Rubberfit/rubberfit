"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"
import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requireActiveTenant } from "@/app/server/auth/require-active-tenant"
import { requirePermission } from "@/app/server/auth/require-permission"
import { resolveService } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { IOrganizationPreferencesService } from "@/src/application/services/organization-preferences.service.interface"
import { DEFAULT_ORGANIZATION_PREFERENCES } from "@/src/infrastructure/models/organization-preferences"
import { SQFT_PER_SQM } from "@/src/application/use-cases/purchase-orders/po-input-conversion"
import { type MaterialType, type MaterialTypeSnapshot } from "@/src/entities/material-type"
import { MaterialTypeId, ProfileId, TenantId } from "@/src/entities/value-objects/id"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { rollService } from "@/src/infrastructure/services/rollService"

/**
 * Material-type management actions.
 *
 * Pre-action call sites scattered across:
 *   - `/dashboard/settings/materials` (manageMaterialTypes route)
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
 * `manageMaterialTypes` (admin/manager).
 *
 * Trade-off note on `deleteMaterialType`: the page handler does FK
 * pre-flight checks (rolls + PO items) before calling the service so
 * users get a specific "in use by rolls" message instead of a
 * generic FK error. Delete is now a soft-delete (sets `deleted_at`)
 * via the entity-typed service; the FK pre-flight checks remain so
 * operators can't accidentally hide a material that's actively in
 * use.
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
  min_stock_sqm: nonNegativeNumber.optional(),
})

const updateMaterialTypeSchema = z.object({
  id: materialIdSchema,
  name: z.string().trim().min(1, "Name is required").max(100).optional(),
  description: z.string().trim().max(500).optional(),
  min_stock_sqm: nonNegativeNumber.optional(),
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

function entityToSnapshot(entity: MaterialType): MaterialTypeSnapshot {
  return entity.toJSON()
}

export async function createMaterialType(
  input: CreateMaterialTypeActionInput
): Promise<MaterialTypeSnapshot> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const subscription = await requireActiveSubscription(actor)
  requirePermission(actor, "manageMaterialTypes")
  requireActiveTenant(actor)
  const parsed = createMaterialTypeSchema.parse(input)

  const minStockSqm =
    parsed.min_stock_sqm ??
    (await loadLowStockThresholdSqmSeed(subscription.organizationId, actor.id))

  const result = await materialTypeService.createMaterialType({
    id: MaterialTypeId.fromPersistence(crypto.randomUUID()),
    tenantId: TenantId.fromPersistence(actor.activeTenantId),
    name: parsed.name,
    description: parsed.description ?? null,
    minStockSqm,
    createdBy: ProfileId.fromPersistence(actor.id),
  })
  revalidateAllMaterialPaths()
  return entityToSnapshot(result)
}

/**
 * Reads the workspace default low-stock threshold from
 * `tenant_settings.low_stock_threshold_sqft` and converts to sqm at the
 * boundary (the entity stores sqm). Best-effort: a failed lookup seeds
 * from `DEFAULT_ORGANIZATION_PREFERENCES` so create still succeeds.
 * Falling back silently is the right behavior — a missed seed produces
 * a material with the model default, not a 500.
 */
async function loadLowStockThresholdSqmSeed(
  organizationId: string,
  actorId: string
): Promise<number> {
  try {
    const prefsService = resolveService<IOrganizationPreferencesService>(
      TOKENS.IOrganizationPreferencesService
    )
    const prefs = await prefsService.getForOrganization(organizationId)
    return prefs.lowStockThresholdSqft / SQFT_PER_SQM
  } catch (error) {
    console.error(
      `[materials] org-prefs threshold seed lookup failed (organizationId=${organizationId} actorId=${actorId}):`,
      error
    )
    return DEFAULT_ORGANIZATION_PREFERENCES.lowStockThresholdSqft / SQFT_PER_SQM
  }
}

export async function updateMaterialType(
  input: UpdateMaterialTypeActionInput
): Promise<MaterialTypeSnapshot> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  requirePermission(actor, "manageMaterialTypes")
  const parsed = updateMaterialTypeSchema.parse(input)

  // Load current values so omitted fields preserve their state. The
  // entity-typed `updateMaterialType` does a whole-record edit
  // (name + description + minStockSqm), so we project unchanged
  // fields from the existing entity rather than asking the service
  // to merge.
  const existing = await materialTypeService.getById(parsed.id)

  const result = await materialTypeService.updateMaterialType(
    parsed.id,
    {
      name: parsed.name ?? existing.name,
      description: parsed.description !== undefined ? parsed.description : existing.description,
      minStockSqm: parsed.min_stock_sqm !== undefined ? parsed.min_stock_sqm : existing.minStockSqm,
    },
    ProfileId.fromPersistence(actor.id)
  )
  revalidateAllMaterialPaths()
  return entityToSnapshot(result)
}

export async function deleteMaterialType(
  input: DeleteMaterialTypeActionInput
): Promise<DeleteMaterialTypeResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
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

  // Pre-flight FK checks. Soft-delete now (entity-typed service sets
  // `deleted_at`), so existing rolls / PO items remain valid — but
  // operators still want a clear "in use" warning before the catalog
  // entry disappears from the UI.
  const hasRolls = await rollService.existsByMaterialType(material.name)
  if (hasRolls) {
    return {
      ok: false,
      reason: "in_use_by_rolls",
      message: "This material is being used by existing rolls",
    }
  }

  const purchaseOrderService = resolveService<IPurchaseOrderService>(TOKENS.IPurchaseOrderService)
  const hasPOItems = await purchaseOrderService.existsActiveItemsByMaterialType(parsed.id)
  if (hasPOItems) {
    return {
      ok: false,
      reason: "in_use_by_purchase_orders",
      message: "This material is referenced by existing purchase orders",
    }
  }

  try {
    await materialTypeService.softDeleteMaterialType(parsed.id, ProfileId.fromPersistence(actor.id))
    revalidateAllMaterialPaths()
    return { ok: true }
  } catch (error) {
    console.error("[materials] soft-delete failed:", error)
    return {
      ok: false,
      reason: "delete_failed",
      message: "Could not delete material type",
    }
  }
}
