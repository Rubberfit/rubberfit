/**
 * User-management action tests.
 *
 * What we're enforcing:
 *   - Auth + permission checks happen BEFORE input parsing or service
 *     calls (V4.1 enforcement order — fail closed on missing auth, not
 *     after touching the DB).
 *   - The action narrows updateUser's surface to {full_name, email,
 *     roles}; `is_deleted` cannot be smuggled through.
 *   - Self-deactivation guard fires server-side, independent of the
 *     UI's own check.
 *   - Zod validation runs on the action input (rejects bad UUID,
 *     unknown role).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"

const requireAuthenticatedUserMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

const requirePermissionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-permission", () => ({
  requirePermission: requirePermissionMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const updateUserSvcMock = vi.hoisted(() => vi.fn())
const deactivateUserSvcMock = vi.hoisted(() => vi.fn())
const reactivateUserSvcMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/userManagementService", () => ({
  userManagementService: {
    updateUser: updateUserSvcMock,
    deactivateUser: deactivateUserSvcMock,
    reactivateUser: reactivateUserSvcMock,
  },
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

const ADMIN: ActionActor = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@example.com",
  roles: ["admin"],
  isSuperAdmin: false,
}

const TARGET_ID = "00000000-0000-0000-0000-000000000002"

describe("app/actions/users", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ADMIN)
    requirePermissionMock.mockReturnValue(undefined)
    updateUserSvcMock.mockResolvedValue({ id: TARGET_ID })
    deactivateUserSvcMock.mockResolvedValue({ id: TARGET_ID, is_deleted: true })
    reactivateUserSvcMock.mockResolvedValue({ id: TARGET_ID, is_deleted: false })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── updateUser ─────────────────────────────────────────────────

  it("updateUser threads only {full_name, email, roles} to the service", async () => {
    const { updateUser } = await import("@/app/actions/users")

    await updateUser({
      userId: TARGET_ID,
      full_name: "Jane",
      email: "jane@example.com",
      roles: ["manager"],
    })

    expect(requirePermissionMock).toHaveBeenCalledWith(ADMIN, "manageUsers")
    expect(updateUserSvcMock).toHaveBeenCalledWith(TARGET_ID, {
      full_name: "Jane",
      email: "jane@example.com",
      roles: ["manager"],
    })
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/users")
  })

  it("updateUser does NOT forward extra fields like is_deleted (smuggle test)", async () => {
    const { updateUser } = await import("@/app/actions/users")

    // Pretend the client sent an extra is_deleted field. Zod's strip
    // should drop it before the service ever sees it.
    await updateUser({
      userId: TARGET_ID,
      full_name: "Jane",
      email: "jane@example.com",
      roles: ["manager"],
      // @ts-expect-error — deliberately testing smuggle behavior
      is_deleted: true,
    })

    const forwardedUpdates = updateUserSvcMock.mock.calls[0][1]
    expect(forwardedUpdates).not.toHaveProperty("is_deleted")
  })

  it("updateUser rejects bad UUID before calling the service", async () => {
    const { updateUser } = await import("@/app/actions/users")

    await expect(
      updateUser({
        userId: "not-a-uuid",
        full_name: "Jane",
        email: "jane@example.com",
        roles: ["manager"],
      })
    ).rejects.toThrow()
    expect(updateUserSvcMock).not.toHaveBeenCalled()
  })

  it("updateUser rejects unknown role before calling the service", async () => {
    const { updateUser } = await import("@/app/actions/users")

    await expect(
      updateUser({
        userId: TARGET_ID,
        full_name: "Jane",
        email: "jane@example.com",
        // @ts-expect-error — deliberately testing role validation
        roles: ["root"],
      })
    ).rejects.toThrow()
    expect(updateUserSvcMock).not.toHaveBeenCalled()
  })

  it("updateUser rejects unauthenticated callers BEFORE touching the service", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { updateUser } = await import("@/app/actions/users")

    await expect(
      updateUser({
        userId: TARGET_ID,
        full_name: "Jane",
        email: "jane@example.com",
        roles: ["manager"],
      })
    ).rejects.toThrow("unauth")
    expect(updateUserSvcMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("updateUser rejects callers without manageUsers permission", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })
    const { updateUser } = await import("@/app/actions/users")

    await expect(
      updateUser({
        userId: TARGET_ID,
        full_name: "Jane",
        email: "jane@example.com",
        roles: ["manager"],
      })
    ).rejects.toThrow("forbidden")
    expect(updateUserSvcMock).not.toHaveBeenCalled()
  })

  // ── deactivateUser ─────────────────────────────────────────────

  it("deactivateUser refuses self-deactivation with a typed ForbiddenError", async () => {
    const { deactivateUser } = await import("@/app/actions/users")

    // Self-deactivation throws `ForbiddenError` (code: "FORBIDDEN")
    // rather than a plain `Error` so client-side catch wrappers can
    // discriminate on `error.code` across the RPC boundary — the
    // prototype chain doesn't survive serialization, so `instanceof`
    // alone is not load-bearing.
    let captured: unknown
    try {
      await deactivateUser({ userId: ADMIN.id })
    } catch (error) {
      captured = error
    }
    expect(captured).toBeInstanceOf(Error)
    expect((captured as Error).message).toMatch(/cannot deactivate your own account/i)
    expect((captured as { code?: string }).code).toBe("FORBIDDEN")
    expect(deactivateUserSvcMock).not.toHaveBeenCalled()
  })

  it("deactivateUser calls the service for a different user", async () => {
    const { deactivateUser } = await import("@/app/actions/users")

    await deactivateUser({ userId: TARGET_ID })

    expect(requirePermissionMock).toHaveBeenCalledWith(ADMIN, "manageUsers")
    expect(deactivateUserSvcMock).toHaveBeenCalledWith(TARGET_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/users")
  })

  it("deactivateUser rejects unauthenticated callers", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { deactivateUser } = await import("@/app/actions/users")

    await expect(deactivateUser({ userId: TARGET_ID })).rejects.toThrow("unauth")
    expect(deactivateUserSvcMock).not.toHaveBeenCalled()
  })

  // ── reactivateUser ─────────────────────────────────────────────

  it("reactivateUser calls the service and revalidates", async () => {
    const { reactivateUser } = await import("@/app/actions/users")

    await reactivateUser({ userId: TARGET_ID })

    expect(requirePermissionMock).toHaveBeenCalledWith(ADMIN, "manageUsers")
    expect(reactivateUserSvcMock).toHaveBeenCalledWith(TARGET_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/users")
  })

  it("reactivateUser rejects callers without manageUsers permission", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })
    const { reactivateUser } = await import("@/app/actions/users")

    await expect(reactivateUser({ userId: TARGET_ID })).rejects.toThrow("forbidden")
    expect(reactivateUserSvcMock).not.toHaveBeenCalled()
  })
})
