/**
 * Smoke tests for the cuts.ts server-action read facade
 * (`fetchCutsInRange`, `fetchRecentCuts`). Both are subscription-gated
 * read paths that resolve admin-client + the cut-history use-cases,
 * which carry their own privilege scoping internally. We assert
 * the action-layer glue: auth → subscription → admin client →
 * use-case execute with actor identity threaded through.
 *
 * Pattern mirrors `tests/actions/purchase-orders.test.ts`.
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

const resolveUseCaseMock = vi.hoisted(() => vi.fn())
vi.mock("@/di/resolve", () => ({
  resolveUseCase: resolveUseCaseMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

// makeAdminClient returns a service-role client used here because
// privileged roles (admin/manager/supervisor) need to read across
// users; the use-case resolves the right scope via `requesterRoles`.
const makeAdminClientMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/api/_lib/supabase-server", () => ({
  makeAdminClient: makeAdminClientMock,
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-4000-8000-000000000099",
  email: "admin@example.com",
  roles: ["admin"],
  isSuperAdmin: false,
  activeTenantId: null,
}

const FAKE_DB_CLIENT = { __admin: true }
const FROM = new Date("2026-01-01T00:00:00Z")
const TO = new Date("2026-01-31T23:59:59Z")

describe("app/actions/cuts", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requireActiveSubscriptionMock.mockResolvedValue({ kind: "allowed" })
    makeAdminClientMock.mockReturnValue(FAKE_DB_CLIENT)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ─── fetchCutsInRange ─────────────────────────────────────────────────

  it("fetchCutsInRange threads actor identity into the analytics use-case", async () => {
    const fakeRows = [{ id: "cut-1" }, { id: "cut-2" }]
    const execute = vi.fn().mockResolvedValue(fakeRows)
    resolveUseCaseMock.mockReturnValue({ execute })

    const { fetchCutsInRange } = await import("@/app/actions/cuts")
    const result = await fetchCutsInRange(FROM, TO)

    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    expect(requireActiveSubscriptionMock).toHaveBeenCalledWith(ACTOR)
    expect(execute).toHaveBeenCalledWith({
      client: FAKE_DB_CLIENT,
      from: FROM.toISOString(),
      to: TO.toISOString(),
      requesterUserId: ACTOR.id,
      requesterRoles: ACTOR.roles,
      filterUserId: null,
    })
    expect(result).toBe(fakeRows)
  })

  it("fetchCutsInRange forwards `to: null` for open-ended ranges", async () => {
    const execute = vi.fn().mockResolvedValue([])
    resolveUseCaseMock.mockReturnValue({ execute })

    const { fetchCutsInRange } = await import("@/app/actions/cuts")
    await fetchCutsInRange(FROM, null)

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ to: null }))
  })

  it("fetchCutsInRange rejects when auth fails", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { fetchCutsInRange } = await import("@/app/actions/cuts")
    await expect(fetchCutsInRange(FROM, TO)).rejects.toThrow("unauth")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("fetchCutsInRange rejects when subscription is lapsed", async () => {
    requireActiveSubscriptionMock.mockRejectedValue(new Error("NO_ACTIVE_SUBSCRIPTION"))
    const { fetchCutsInRange } = await import("@/app/actions/cuts")
    await expect(fetchCutsInRange(FROM, TO)).rejects.toThrow("NO_ACTIVE_SUBSCRIPTION")
    expect(makeAdminClientMock).not.toHaveBeenCalled()
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  // ─── fetchRecentCuts ──────────────────────────────────────────────────

  it("fetchRecentCuts threads actor identity + limit into the list use-case", async () => {
    const fakeData = [{ id: "cut-3" }]
    const execute = vi.fn().mockResolvedValue({ data: fakeData, total: 1 })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { fetchRecentCuts } = await import("@/app/actions/cuts")
    const result = await fetchRecentCuts(10)

    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    expect(requireActiveSubscriptionMock).toHaveBeenCalledWith(ACTOR)
    expect(execute).toHaveBeenCalledWith({
      client: FAKE_DB_CLIENT,
      page: 1,
      limit: 10,
      from: null,
      to: null,
      filterUserId: null,
      requesterUserId: ACTOR.id,
      requesterRoles: ACTOR.roles,
    })
    expect(result).toBe(fakeData)
  })

  it("fetchRecentCuts returns the data slice (not the full paginated envelope)", async () => {
    const execute = vi.fn().mockResolvedValue({
      data: [{ id: "cut-only" }],
      total: 99,
      page: 1,
    })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { fetchRecentCuts } = await import("@/app/actions/cuts")
    const result = await fetchRecentCuts(5)
    expect(result).toEqual([{ id: "cut-only" }])
  })

  it("fetchRecentCuts rejects when auth fails", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { fetchRecentCuts } = await import("@/app/actions/cuts")
    await expect(fetchRecentCuts(10)).rejects.toThrow("unauth")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("fetchRecentCuts rejects when subscription is lapsed", async () => {
    requireActiveSubscriptionMock.mockRejectedValue(new Error("NO_ACTIVE_SUBSCRIPTION"))
    const { fetchRecentCuts } = await import("@/app/actions/cuts")
    await expect(fetchRecentCuts(10)).rejects.toThrow("NO_ACTIVE_SUBSCRIPTION")
    expect(makeAdminClientMock).not.toHaveBeenCalled()
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })
})
