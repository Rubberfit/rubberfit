/**
 * `selectTenant` action — exercises the chooser server action.
 *
 * What we're enforcing:
 *   - Auth runs BEFORE the input is parsed or any DB call fires.
 *   - The action membership-validates the target tenant; a caller
 *     can't smuggle a tenant id they don't belong to into their own
 *     cookie + last_active_tenant_id.
 *   - On success, last_active_tenant_id is persisted, the cookie is
 *     written, and the root layout is revalidated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"

const requireAuthenticatedUserMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const persistLastActiveTenantMock = vi.hoisted(() => vi.fn())
const verifyTenantMembershipMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/active-tenant.service", () => ({
  persistLastActiveTenant: persistLastActiveTenantMock,
  verifyTenantMembership: verifyTenantMembershipMock,
}))

const getDatabaseClientMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/supabase/get-database-client", () => ({
  getDatabaseClient: getDatabaseClientMock,
}))

const cookieSetMock = vi.hoisted(() => vi.fn())
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: cookieSetMock }),
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

const USER: ActionActor = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "u@example.com",
  roles: [],
  isSuperAdmin: false,
  activeTenantId: null,
}
const TENANT_ID = "00000000-0000-0000-0000-000000000aaa"

describe("selectTenant", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(USER)
    persistLastActiveTenantMock.mockResolvedValue(undefined)
    getDatabaseClientMock.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("rejects bad UUID before touching the DB", async () => {
    const { selectTenant } = await import("@/app/actions/active-tenant")
    await expect(selectTenant({ tenantId: "not-a-uuid" })).rejects.toThrow()
    expect(getDatabaseClientMock).not.toHaveBeenCalled()
    expect(verifyTenantMembershipMock).not.toHaveBeenCalled()
  })

  it("throws Forbidden when caller is not a member of the target tenant", async () => {
    verifyTenantMembershipMock.mockResolvedValue(false)
    const { selectTenant } = await import("@/app/actions/active-tenant")
    await expect(selectTenant({ tenantId: TENANT_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    expect(persistLastActiveTenantMock).not.toHaveBeenCalled()
    expect(cookieSetMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("persists, writes the cookie, and revalidates on success", async () => {
    verifyTenantMembershipMock.mockResolvedValue(true)
    const { selectTenant } = await import("@/app/actions/active-tenant")
    const result = await selectTenant({ tenantId: TENANT_ID })
    expect(result).toEqual({ ok: true })
    expect(persistLastActiveTenantMock).toHaveBeenCalledWith(
      expect.anything(),
      USER.id,
      TENANT_ID
    )
    expect(cookieSetMock).toHaveBeenCalledWith(
      "rema_active_tenant",
      TENANT_ID,
      expect.objectContaining({ httpOnly: true })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout")
  })

  it("rejects unauthenticated callers BEFORE touching the DB", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { selectTenant } = await import("@/app/actions/active-tenant")
    await expect(selectTenant({ tenantId: TENANT_ID })).rejects.toThrow("unauth")
    expect(getDatabaseClientMock).not.toHaveBeenCalled()
  })
})
