/**
 * Smoke tests for the 7c-2 admin reconcile server-action wrappers.
 *
 * Pattern mirrors `tests/actions/purchase-orders.test.ts`: mock the auth /
 * permission helpers, the DI resolver, the database-factory registrar, and
 * `revalidatePath`; then assert each action threads `actor` through, gates
 * on `reconcileReceipts`, Zod-rejects malformed input, and invalidates the
 * reconciliation page after a successful execute.
 *
 * Use-case logic itself is exercised separately under
 * `tests/use-cases/reconcile-pending-{apply,roll-creation}.use-case.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"

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

const resolveUseCaseMock = vi.hoisted(() => vi.fn())
vi.mock("@/di/resolve", () => ({
  resolveUseCase: resolveUseCaseMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-4000-8000-000000000099",
  email: "admin@example.com",
  roles: ["admin"],
  isSuperAdmin: false,
  activeTenantId: null,
}

const RECONCILE_PATH = "/dashboard/admin/inventory/po-reconciliation"
const RECEIPT_ID = "00000000-0000-4000-8000-000000000010"

describe("app/actions/po-reconciliation", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requireActiveSubscriptionMock.mockResolvedValue({ kind: "allowed" })
    requirePermissionMock.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ─── reconcilePendingApply ───────────────────────────────────────────────

  it("reconcilePendingApply calls auth + permission then executes the use-case with actor", async () => {
    const execute = vi.fn().mockResolvedValue({
      purchaseOrder: { id: "po-id" },
      alreadyApplied: false,
    })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { reconcilePendingApply } = await import("@/app/actions/po-reconciliation")
    const result = await reconcilePendingApply({ receiptId: RECEIPT_ID })

    expect(ensureDatabaseFactoryRegisteredMock).toHaveBeenCalledOnce()
    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "reconcileReceipts")
    expect(execute).toHaveBeenCalledWith({ receiptId: RECEIPT_ID, actor: ACTOR })
    expect(revalidatePathMock).toHaveBeenCalledWith(RECONCILE_PATH)
    expect(result).toEqual({ purchaseOrder: { id: "po-id" }, alreadyApplied: false })
  })

  it("reconcilePendingApply rejects when auth fails", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))

    const { reconcilePendingApply } = await import("@/app/actions/po-reconciliation")
    await expect(reconcilePendingApply({ receiptId: RECEIPT_ID })).rejects.toThrow("unauth")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("reconcilePendingApply rejects when permission fails", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })

    const { reconcilePendingApply } = await import("@/app/actions/po-reconciliation")
    await expect(reconcilePendingApply({ receiptId: RECEIPT_ID })).rejects.toThrow("forbidden")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("reconcilePendingApply Zod-rejects non-UUID receiptId", async () => {
    const execute = vi.fn()
    resolveUseCaseMock.mockReturnValue({ execute })

    const { reconcilePendingApply } = await import("@/app/actions/po-reconciliation")
    await expect(reconcilePendingApply({ receiptId: "not-a-uuid" })).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  // ─── reconcilePendingRollCreation ────────────────────────────────────────

  it("reconcilePendingRollCreation threads actor through and revalidates on success", async () => {
    const execute = vi.fn().mockResolvedValue({ kind: "created", roll: { id: "roll-id" } })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { reconcilePendingRollCreation } = await import("@/app/actions/po-reconciliation")
    const result = await reconcilePendingRollCreation({ receiptId: RECEIPT_ID })

    expect(ensureDatabaseFactoryRegisteredMock).toHaveBeenCalledOnce()
    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "reconcileReceipts")
    expect(execute).toHaveBeenCalledWith({ receiptId: RECEIPT_ID, actor: ACTOR })
    expect(revalidatePathMock).toHaveBeenCalledWith(RECONCILE_PATH)
    expect(result).toEqual({ kind: "created", roll: { id: "roll-id" } })
  })

  it("reconcilePendingRollCreation rejects when auth fails", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))

    const { reconcilePendingRollCreation } = await import("@/app/actions/po-reconciliation")
    await expect(reconcilePendingRollCreation({ receiptId: RECEIPT_ID })).rejects.toThrow("unauth")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("reconcilePendingRollCreation rejects when permission fails", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })

    const { reconcilePendingRollCreation } = await import("@/app/actions/po-reconciliation")
    await expect(reconcilePendingRollCreation({ receiptId: RECEIPT_ID })).rejects.toThrow(
      "forbidden"
    )
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("reconcilePendingRollCreation Zod-rejects non-UUID receiptId", async () => {
    const execute = vi.fn()
    resolveUseCaseMock.mockReturnValue({ execute })

    const { reconcilePendingRollCreation } = await import("@/app/actions/po-reconciliation")
    await expect(reconcilePendingRollCreation({ receiptId: "not-a-uuid" })).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("reconcilePendingRollCreation strips unknown keys before forwarding to use-case", async () => {
    const execute = vi.fn().mockResolvedValue({ kind: "already-stamped", roll: { id: "roll-id" } })
    resolveUseCaseMock.mockReturnValue({ execute })

    const smuggled = {
      receiptId: RECEIPT_ID,
      forceRecreate: true,
      escalate: "admin",
    } as unknown as { receiptId: string }

    const { reconcilePendingRollCreation } = await import("@/app/actions/po-reconciliation")
    await reconcilePendingRollCreation(smuggled)

    const calledWith = execute.mock.calls[0]?.[0] as Record<string, unknown>
    expect(calledWith.forceRecreate).toBeUndefined()
    expect(calledWith.escalate).toBeUndefined()
    expect(calledWith.receiptId).toBe(RECEIPT_ID)
    expect(calledWith.actor).toBe(ACTOR)
  })
})
