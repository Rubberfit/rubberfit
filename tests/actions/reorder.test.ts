/**
 * Reorder action tests — post-DDD migration.
 *
 * The actions no longer accept client-supplied `suggestion[]` /
 * `reorderRules` payloads. Server fetches rules + stock + pending
 * POs, runs the generate-suggestions use-case, and forwards the
 * authoritative result to the create use-case.
 *
 * Post-shim-retirement, reads flow through the entity-typed
 * `IReorderService` (resolved via DI) and `IReorderCalculationsService`
 * (also DI). Material + supplier joins are bulk-fetched via the
 * module-level `materialTypeService` / `supplierService` singletons.
 *
 * Tests mock:
 *   - `requireAuthenticatedUser` + `requirePermission` (auth gate)
 *   - `resolveUseCase` (returns a fake with `execute` mocked)
 *   - `resolveService` (returns reorderService or calc service by token)
 *   - `materialTypeService.getByIds` + `supplierService.getActiveSuppliers`
 *   - `purchaseOrderService.getPurchaseOrdersByStatuses`
 *   - `revalidatePath`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"
import type { ReorderRule } from "@/src/entities/reorder-rule"
import type { MaterialType } from "@/src/entities/material-type"
import type { Supplier } from "@/src/entities/supplier"
import type { ReorderSuggestionOutput } from "@/src/application/use-cases/reorder/generate-reorder-suggestions.use-case"
import {
  DEFAULT_ORGANIZATION_PREFERENCES,
  type OrganizationPreferences,
} from "@/src/infrastructure/models/organization-preferences"
import { SQFT_PER_SQM } from "@/src/application/use-cases/purchase-orders/po-input-conversion"
import { TOKENS } from "@/di/tokens"

const requireAuthenticatedUserMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

const requireActiveSubscriptionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-active-subscription", () => ({
  requireActiveSubscription: requireActiveSubscriptionMock,
}))

const requirePermissionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-permission", () => ({
  requirePermission: requirePermissionMock,
}))

const requireActiveTenantMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-active-tenant", () => ({
  requireActiveTenant: requireActiveTenantMock,
}))

const resolveUseCaseMock = vi.hoisted(() => vi.fn())
const resolveServiceMock = vi.hoisted(() => vi.fn())
vi.mock("@/di/resolve", () => ({
  resolveUseCase: resolveUseCaseMock,
  resolveService: resolveServiceMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const reorderServiceMock = vi.hoisted(() => ({
  getActiveRules: vi.fn(),
  createRule: vi.fn(),
}))
const calcServiceMock = vi.hoisted(() => ({
  calculateCurrentStock: vi.fn(),
}))

// PR 2f: `createReorderRule` action seeds `reorder_point` from
// `organization_preferences.lowStockThresholdSqft` when omitted.
const orgPrefsServiceMock = vi.hoisted(() => ({
  getForOrganization: vi.fn<(id: string) => Promise<OrganizationPreferences>>(),
}))
const poServiceMock = vi.hoisted(() => ({
  getByStatuses: vi.fn(),
}))

const materialTypeServiceMock = vi.hoisted(() => ({
  getByIds: vi.fn(),
}))
vi.mock("@/src/infrastructure/services/materialTypeService", () => ({
  materialTypeService: materialTypeServiceMock,
}))

const supplierServiceMock = vi.hoisted(() => ({
  getActiveSuppliers: vi.fn(),
}))
vi.mock("@/src/infrastructure/services/supplierService", () => ({
  supplierService: supplierServiceMock,
}))

// Pending POs are now sourced via the entity-typed IPurchaseOrderService
// (resolved via DI) instead of the legacy shim. The mock returns empty
// entity arrays by default; tests that need pending-PO presence override
// the resolver fake's `getByStatuses` directly.

const revalidatePathMock = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

const TENANT_ID = "00000000-0000-4000-8000-000000000001"

const ACTOR: ActionActor = {
  id: "00000000-0000-4000-8000-000000000099",
  email: "alice@example.com",
  roles: ["manager"],
  isSuperAdmin: false,
  activeTenantId: TENANT_ID,
}

const ORG_ID = "00000000-0000-4000-8000-0000000000aa"

// Stable test UUIDs.
const MATERIAL_TYPE_ID = "00000000-0000-4000-8000-000000000010"
const MATERIAL_TYPE_ID_B = "00000000-0000-4000-8000-000000000020"
const SUPPLIER_ID = "00000000-0000-4000-8000-000000000011"
const RULE_ID = "00000000-0000-4000-8000-000000000012"
const PO_ID = "00000000-0000-4000-8000-000000000013"

// Plain-object stand-ins shaped to match entity getter access. The
// action reads `.materialTypeId.value`, `.supplierId?.value`,
// `.reorderPointSqm`, etc.; the mocks mirror that shape, cast at the
// boundary.
function buildRule(overrides: Partial<{
  ruleId: string
  materialTypeId: string
  supplierId: string | null
}> = {}): ReorderRule {
  const rId = overrides.ruleId ?? RULE_ID
  const mId = overrides.materialTypeId ?? MATERIAL_TYPE_ID
  const sId = overrides.supplierId ?? SUPPLIER_ID
  return {
    id: { value: rId },
    tenantId: { value: TENANT_ID },
    materialTypeId: { value: mId },
    supplierId: sId === null ? null : { value: sId },
    reorderPointSqm: 50,
    reorderQuantitySqm: 100,
    maxStockLevelSqm: 200,
    leadTimeDays: 7,
    safetyStockDays: 3,
    autoReorder: false,
    isActive: true,
    notes: null,
    lastTriggeredAt: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
  } as unknown as ReorderRule
}

function buildMaterial(id = MATERIAL_TYPE_ID, name = "Black butyl rubber"): MaterialType {
  return {
    id: { value: id },
    name,
  } as unknown as MaterialType
}

function buildSupplier(id = SUPPLIER_ID, name = "Acme Rubber"): Supplier {
  return {
    id: { value: id },
    name,
  } as unknown as Supplier
}

// Authoritative suggestion the generate use-case "produces" — what
// the create use-case ends up consuming. Its `estimatedCost` /
// `suggestedQuantity` are server-computed from the rule + stock
// (not anything a client sent).
const AUTHORITATIVE_SUGGESTION: ReorderSuggestionOutput = {
  materialTypeId: MATERIAL_TYPE_ID,
  materialName: "Black butyl rubber",
  currentStock: 10,
  reorderPoint: 50,
  suggestedQuantity: 100,
  urgencyLevel: "high",
  daysUntilStockout: 5,
  supplierId: SUPPLIER_ID,
  supplierName: "Acme Rubber",
  estimatedCost: 550,
}

// `resolveUseCase` is called multiple times per action: once for
// generate, once for the create. Route by token so the test can
// observe what each use-case received without juggling call order.
function setupUseCaseResolver(opts: {
  generateExecute?: ReturnType<typeof vi.fn>
  createSingleExecute?: ReturnType<typeof vi.fn>
  createBulkExecute?: ReturnType<typeof vi.fn>
}) {
  resolveUseCaseMock.mockImplementation((token: symbol) => {
    if (token === TOKENS.IGenerateReorderSuggestionsUseCase && opts.generateExecute) {
      return { execute: opts.generateExecute }
    }
    if (token === TOKENS.ICreateReorderPurchaseOrderUseCase && opts.createSingleExecute) {
      return { execute: opts.createSingleExecute }
    }
    if (token === TOKENS.ICreateBulkReorderPurchaseOrderUseCase && opts.createBulkExecute) {
      return { execute: opts.createBulkExecute }
    }
    throw new Error(`Unexpected resolveUseCase token: ${String(token)}`)
  })
}

function setupServiceResolver() {
  resolveServiceMock.mockImplementation((token: symbol) => {
    if (token === TOKENS.IReorderService) return reorderServiceMock
    if (token === TOKENS.IReorderCalculationsService) return calcServiceMock
    if (token === TOKENS.IPurchaseOrderService) return poServiceMock
    if (token === TOKENS.IOrganizationPreferencesService) return orgPrefsServiceMock
    throw new Error(`Unexpected resolveService token: ${String(token)}`)
  })
}

function buildOrgPrefs(
  overrides: Partial<OrganizationPreferences> = {}
): OrganizationPreferences {
  return {
    organizationId: ORG_ID,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...DEFAULT_ORGANIZATION_PREFERENCES,
    ...overrides,
  }
}

describe("app/actions/reorder", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requireActiveSubscriptionMock.mockResolvedValue({
      kind: "allowed",
      organizationId: ORG_ID,
    })
    requirePermissionMock.mockReturnValue(undefined)
    requireActiveTenantMock.mockReturnValue(TENANT_ID)
    setupServiceResolver()
    reorderServiceMock.getActiveRules.mockResolvedValue([buildRule()])
    calcServiceMock.calculateCurrentStock.mockResolvedValue(10)
    materialTypeServiceMock.getByIds.mockResolvedValue([buildMaterial()])
    supplierServiceMock.getActiveSuppliers.mockResolvedValue([buildSupplier()])
    poServiceMock.getByStatuses.mockResolvedValue([])
    orgPrefsServiceMock.getForOrganization.mockResolvedValue(buildOrgPrefs())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── createReorderPurchaseOrder ────────────────────────────────────

  it("createReorderPurchaseOrder regenerates suggestions server-side from materialTypeId", async () => {
    const generateExecute = vi.fn().mockResolvedValue([AUTHORITATIVE_SUGGESTION])
    const createSingleExecute = vi.fn().mockResolvedValue({ purchaseOrder: { id: PO_ID } })
    setupUseCaseResolver({ generateExecute, createSingleExecute })

    const { createReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await createReorderPurchaseOrder({ materialTypeId: MATERIAL_TYPE_ID })

    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(reorderServiceMock.getActiveRules).toHaveBeenCalled()
    expect(generateExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: expect.arrayContaining([
          expect.objectContaining({ material_type_id: MATERIAL_TYPE_ID, current_stock: 10 }),
        ]),
        pendingPOs: [],
      })
    )

    // Authoritative suggestion is what the create use-case sees — the
    // client never authored it.
    expect(createSingleExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestion: AUTHORITATIVE_SUGGESTION,
        actor: ACTOR,
      })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/reorder")
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/purchase-orders")
  })

  it("createReorderPurchaseOrder ignores client-attempted smuggling — input shape is just { materialTypeId }", async () => {
    const generateExecute = vi.fn().mockResolvedValue([AUTHORITATIVE_SUGGESTION])
    const createSingleExecute = vi.fn().mockResolvedValue({ purchaseOrder: { id: PO_ID } })
    setupUseCaseResolver({ generateExecute, createSingleExecute })

    // A malicious client smuggles authored suggestion / forged actor.
    // Zod strips them — the action only sees materialTypeId.
    const smuggled = {
      materialTypeId: MATERIAL_TYPE_ID,
      suggestion: { ...AUTHORITATIVE_SUGGESTION, estimatedCost: 999_999 },
      reorderRules: [{ id: RULE_ID, reorder_quantity: 999 }],
      forgedActorId: "00000000-0000-4000-8000-000000000666",
    } as unknown as { materialTypeId: string }

    const { createReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await createReorderPurchaseOrder(smuggled)

    // The create use-case got the authoritative server-computed
    // suggestion, NOT the smuggled $999,999 one.
    expect(createSingleExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestion: AUTHORITATIVE_SUGGESTION,
        actor: ACTOR,
      })
    )
    const calledWith = createSingleExecute.mock.calls[0][0] as Record<string, unknown>
    expect(calledWith.forgedActorId).toBeUndefined()
  })

  it("createReorderPurchaseOrder Zod-rejects malformed materialTypeId", async () => {
    const { createReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await expect(createReorderPurchaseOrder({ materialTypeId: "not-a-uuid" })).rejects.toThrow()
    expect(reorderServiceMock.getActiveRules).not.toHaveBeenCalled()
  })

  it("createReorderPurchaseOrder throws when generator produces no suggestion (above reorder point or no rule)", async () => {
    // Generator returns empty — material is above reorder point, has
    // no active rule, or has no resolvable supplier.
    const generateExecute = vi.fn().mockResolvedValue([])
    setupUseCaseResolver({ generateExecute })

    const { createReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await expect(createReorderPurchaseOrder({ materialTypeId: MATERIAL_TYPE_ID })).rejects.toThrow(
      /No reorder needed|no supplier/i
    )
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  // ── createBulkReorderPurchaseOrder ────────────────────────────────

  it("createBulkReorderPurchaseOrder regenerates suggestions server-side from materialTypeIds", async () => {
    const generateExecute = vi.fn().mockResolvedValue([AUTHORITATIVE_SUGGESTION])
    const createBulkExecute = vi
      .fn()
      .mockResolvedValue({ purchaseOrders: [{ id: PO_ID }], skipped: [] })
    setupUseCaseResolver({ generateExecute, createBulkExecute })

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    const result = await createBulkReorderPurchaseOrder({
      materialTypeIds: [MATERIAL_TYPE_ID],
    })

    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(reorderServiceMock.getActiveRules).toHaveBeenCalled()
    expect(createBulkExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestions: [AUTHORITATIVE_SUGGESTION],
        actor: ACTOR,
      })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/reorder")
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/purchase-orders")
    expect(result.purchaseOrders).toHaveLength(1)
  })

  it("createBulkReorderPurchaseOrder filters out unrequested materials even if generator returns extras", async () => {
    const otherSuggestion: ReorderSuggestionOutput = {
      ...AUTHORITATIVE_SUGGESTION,
      materialTypeId: MATERIAL_TYPE_ID_B,
      materialName: "Different material",
    }
    const generateExecute = vi.fn().mockResolvedValue([AUTHORITATIVE_SUGGESTION, otherSuggestion])
    const createBulkExecute = vi
      .fn()
      .mockResolvedValue({ purchaseOrders: [{ id: PO_ID }], skipped: [] })
    setupUseCaseResolver({ generateExecute, createBulkExecute })

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await createBulkReorderPurchaseOrder({ materialTypeIds: [MATERIAL_TYPE_ID] })

    // Only the requested suggestion reaches the create use-case.
    const passedSuggestions = (createBulkExecute.mock.calls[0][0] as { suggestions: unknown[] })
      .suggestions
    expect(passedSuggestions).toHaveLength(1)
    expect((passedSuggestions[0] as ReorderSuggestionOutput).materialTypeId).toBe(MATERIAL_TYPE_ID)
  })

  it("createBulkReorderPurchaseOrder skips revalidation when no POs are created", async () => {
    const generateExecute = vi.fn().mockResolvedValue([AUTHORITATIVE_SUGGESTION])
    const createBulkExecute = vi.fn().mockResolvedValue({
      purchaseOrders: [],
      skipped: [
        {
          suggestion: AUTHORITATIVE_SUGGESTION,
          reason: "no_supplier" as const,
          message: "No supplier configured for this material",
        },
      ],
    })
    setupUseCaseResolver({ generateExecute, createBulkExecute })

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await createBulkReorderPurchaseOrder({ materialTypeIds: [MATERIAL_TYPE_ID] })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("createBulkReorderPurchaseOrder returns empty result when generator produces no suggestions", async () => {
    // No active rules match the requested IDs — short-circuit before
    // the create use-case is even resolved.
    reorderServiceMock.getActiveRules.mockResolvedValue([])

    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    const result = await createBulkReorderPurchaseOrder({
      materialTypeIds: [MATERIAL_TYPE_ID],
    })
    expect(result).toEqual({ purchaseOrders: [], skipped: [] })
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("createBulkReorderPurchaseOrder Zod-rejects empty materialTypeIds", async () => {
    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await expect(createBulkReorderPurchaseOrder({ materialTypeIds: [] })).rejects.toThrow()
    expect(reorderServiceMock.getActiveRules).not.toHaveBeenCalled()
  })

  it("createBulkReorderPurchaseOrder rejects unauthenticated callers", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { createBulkReorderPurchaseOrder } = await import("@/app/actions/reorder")
    await expect(
      createBulkReorderPurchaseOrder({ materialTypeIds: [MATERIAL_TYPE_ID] })
    ).rejects.toThrow("unauth")
    expect(reorderServiceMock.getActiveRules).not.toHaveBeenCalled()
  })

  // ── generateReorderSuggestions ────────────────────────────────────

  it("generateReorderSuggestions enforces auth + permission and fetches server-side data", async () => {
    const generateExecute = vi.fn().mockResolvedValue([AUTHORITATIVE_SUGGESTION])
    setupUseCaseResolver({ generateExecute })

    const { generateReorderSuggestions } = await import("@/app/actions/reorder")
    const result = await generateReorderSuggestions()

    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(reorderServiceMock.getActiveRules).toHaveBeenCalled()
    expect(generateExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: expect.arrayContaining([
          expect.objectContaining({ material_type_id: MATERIAL_TYPE_ID }),
        ]),
        pendingPOs: [],
      })
    )
    // Read-only — no actor field passed to the use-case
    expect(generateExecute).not.toHaveBeenCalledWith(expect.objectContaining({ actor: ACTOR }))
    expect(revalidatePathMock).not.toHaveBeenCalled()
    expect(result).toEqual([AUTHORITATIVE_SUGGESTION])
  })

  it("generateReorderSuggestions returns empty array when no active rules exist", async () => {
    reorderServiceMock.getActiveRules.mockResolvedValue([])

    const { generateReorderSuggestions } = await import("@/app/actions/reorder")
    const result = await generateReorderSuggestions()

    expect(result).toEqual([])
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("generateReorderSuggestions rejects unauthenticated callers", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { generateReorderSuggestions } = await import("@/app/actions/reorder")
    await expect(generateReorderSuggestions()).rejects.toThrow("unauth")
    expect(reorderServiceMock.getActiveRules).not.toHaveBeenCalled()
  })

  // ── getCurrentStockByMaterials ────────────────────────────────────

  it("getCurrentStockByMaterials returns a per-material stock map from the calc service", async () => {
    calcServiceMock.calculateCurrentStock
      .mockResolvedValueOnce(42)
      .mockResolvedValueOnce(7)

    const { getCurrentStockByMaterials } = await import("@/app/actions/reorder")
    const result = await getCurrentStockByMaterials([MATERIAL_TYPE_ID, MATERIAL_TYPE_ID_B])

    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(calcServiceMock.calculateCurrentStock).toHaveBeenCalledWith(MATERIAL_TYPE_ID)
    expect(calcServiceMock.calculateCurrentStock).toHaveBeenCalledWith(MATERIAL_TYPE_ID_B)
    expect(result).toEqual({ [MATERIAL_TYPE_ID]: 42, [MATERIAL_TYPE_ID_B]: 7 })
  })

  it("getCurrentStockByMaterials short-circuits on empty input without resolving services", async () => {
    const { getCurrentStockByMaterials } = await import("@/app/actions/reorder")
    const result = await getCurrentStockByMaterials([])
    expect(result).toEqual({})
    expect(resolveServiceMock).not.toHaveBeenCalled()
  })

  it("getCurrentStockByMaterials de-duplicates IDs before calling the calc service", async () => {
    calcServiceMock.calculateCurrentStock.mockResolvedValue(5)
    const { getCurrentStockByMaterials } = await import("@/app/actions/reorder")
    await getCurrentStockByMaterials([MATERIAL_TYPE_ID, MATERIAL_TYPE_ID, MATERIAL_TYPE_ID])
    expect(calcServiceMock.calculateCurrentStock).toHaveBeenCalledTimes(1)
  })

  // ── createReorderRule ─────────────────────────────────────────────

  const BASE_RULE_INPUT = {
    material_type_id: MATERIAL_TYPE_ID,
    reorder_quantity: 100,
    lead_time_days: 7,
  }

  it("createReorderRule preserves an explicit reorder_point (sqft→sqm at boundary)", async () => {
    const { createReorderRule } = await import("@/app/actions/reorder")

    await createReorderRule({ ...BASE_RULE_INPUT, reorder_point: 42 })

    expect(orgPrefsServiceMock.getForOrganization).not.toHaveBeenCalled()
    expect(reorderServiceMock.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        materialTypeId: expect.objectContaining({ value: MATERIAL_TYPE_ID }),
        reorderPointSqm: 42 / SQFT_PER_SQM,
        reorderQuantitySqm: 100 / SQFT_PER_SQM,
        leadTimeDays: 7,
        actor: expect.objectContaining({ value: ACTOR.id }),
      })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory/reorder")
  })

  it("createReorderRule seeds reorder_point from org prefs (sqft) when omitted, converted to sqm at service", async () => {
    orgPrefsServiceMock.getForOrganization.mockResolvedValue(
      buildOrgPrefs({ lowStockThresholdSqft: 275 })
    )
    const { createReorderRule } = await import("@/app/actions/reorder")

    await createReorderRule(BASE_RULE_INPUT)

    expect(orgPrefsServiceMock.getForOrganization).toHaveBeenCalledWith(ORG_ID)
    expect(reorderServiceMock.createRule).toHaveBeenCalledWith(
      expect.objectContaining({ reorderPointSqm: 275 / SQFT_PER_SQM })
    )
  })

  it("createReorderRule preserves an explicit reorder_point: 0 (no-alert override)", async () => {
    const { createReorderRule } = await import("@/app/actions/reorder")

    await createReorderRule({ ...BASE_RULE_INPUT, reorder_point: 0 })

    expect(orgPrefsServiceMock.getForOrganization).not.toHaveBeenCalled()
    expect(reorderServiceMock.createRule).toHaveBeenCalledWith(
      expect.objectContaining({ reorderPointSqm: 0 })
    )
  })

  it("createReorderRule falls back to the model default (sqm) when org-prefs lookup fails", async () => {
    orgPrefsServiceMock.getForOrganization.mockRejectedValue(new Error("rls denied"))
    const { createReorderRule } = await import("@/app/actions/reorder")

    await createReorderRule(BASE_RULE_INPUT)

    expect(reorderServiceMock.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        reorderPointSqm: DEFAULT_ORGANIZATION_PREFERENCES.lowStockThresholdSqft / SQFT_PER_SQM,
      })
    )
  })

  it("createReorderRule requires manageRolls permission", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })
    const { createReorderRule } = await import("@/app/actions/reorder")

    await expect(createReorderRule(BASE_RULE_INPUT)).rejects.toThrow("forbidden")
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    expect(reorderServiceMock.createRule).not.toHaveBeenCalled()
  })

  it("createReorderRule rejects max_stock_level less than reorder_point", async () => {
    const { createReorderRule } = await import("@/app/actions/reorder")

    await expect(
      createReorderRule({ ...BASE_RULE_INPUT, reorder_point: 500, max_stock_level: 100 })
    ).rejects.toThrow()
    expect(reorderServiceMock.createRule).not.toHaveBeenCalled()
  })

  it("createReorderRule rejects max_stock_level lower than the seeded reorder_point", async () => {
    // Caller omits reorder_point (seed = 275 sqft) but caps max_stock_level
    // at 100 sqft. The Zod refinement can't see the seeded value, so the
    // action's post-seed guard must catch the violation — and must
    // throw a ZodError on the `max_stock_level` path so client forms
    // map both rejection paths uniformly. Sigilix PR #269 catch. Note
    // the guard compares in sqft (pre-conversion) so the user-facing
    // error message stays in input units.
    orgPrefsServiceMock.getForOrganization.mockResolvedValue(
      buildOrgPrefs({ lowStockThresholdSqft: 275 })
    )
    const { z } = await import("zod")
    const { createReorderRule } = await import("@/app/actions/reorder")

    const err = await createReorderRule({
      ...BASE_RULE_INPUT,
      max_stock_level: 100,
    }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(z.ZodError)
    if (err instanceof z.ZodError) {
      expect(err.issues).toEqual([
        expect.objectContaining({
          path: ["max_stock_level"],
          message: expect.stringMatching(/max stock level/i),
        }),
      ])
    }
    expect(reorderServiceMock.createRule).not.toHaveBeenCalled()
  })
})
