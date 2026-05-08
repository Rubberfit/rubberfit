/**
 * Inventory action tests — addRoll.
 *
 * What we're enforcing:
 *   - manageRolls permission required (V4.2).
 *   - actor.id is threaded into rollService.addRoll, not derived from
 *     getCurrentUserId on the server side (the browser singleton has
 *     no Node session, so a missing actor.id would 42501 on RLS).
 *   - Field surface narrowing: client cannot smuggle status,
 *     part_number, is_offcut, etc. — only the dialog-shaped fields
 *     are accepted, derived fields are computed server-side.
 *   - Zod validation: width/length/thickness must be positive,
 *     material_type required.
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

const addRollSvcMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/rollService", () => ({
  rollService: {
    addRoll: addRollSvcMock,
  },
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "manager@example.com",
  roles: ["manager"],
  isSuperAdmin: false,
}

describe("app/actions/inventory.addRoll", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requirePermissionMock.mockReturnValue(undefined)
    addRollSvcMock.mockResolvedValue({ id: "roll-1" })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("computes derived fields server-side and threads actor.id", async () => {
    const { addRoll } = await import("@/app/actions/inventory")

    // Without a client-supplied date, the action falls back to UTC.
    // Capture the UTC date before/after the awaited call so we can
    // bound on both sides — `>= today` alone would pass if the action
    // accidentally returned tomorrow's date. The before/after window
    // accommodates a UTC midnight crossing during the test.
    // (coderabbit follow-up on PR #197.)
    const beforeUtc = new Date().toISOString().slice(0, 10)
    await addRoll({
      material_type: "Butyl",
      width: 60,
      length: 240,
      thickness: 0.5,
    })
    const afterUtc = new Date().toISOString().slice(0, 10)

    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageRolls")
    const [rollArg, userIdArg] = addRollSvcMock.mock.calls[0]
    expect(rollArg).toMatchObject({
      material_type: "Butyl",
      width: 60,
      length: 240,
      thickness: 0.5,
      // Derived
      remaining_length: 240,
      status: "active",
    })
    expect(typeof rollArg.date_received).toBe("string")
    expect(rollArg.date_received).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(rollArg.date_received >= beforeUtc).toBe(true)
    expect(rollArg.date_received <= afterUtc).toBe(true)
    expect(userIdArg).toBe(ACTOR.id)
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/inventory")
  })

  it("forwards client-supplied date_received instead of computing server-side", async () => {
    const { addRoll } = await import("@/app/actions/inventory")

    // Form computes user-local YYYY-MM-DD and passes it through —
    // restoring pre-action behavior for users in negative-UTC offsets
    // (sigilix PR #177 follow-up).
    await addRoll({
      material_type: "Butyl",
      width: 60,
      length: 240,
      thickness: 0.5,
      date_received: "2026-05-07",
    })

    const rollArg = addRollSvcMock.mock.calls[0][0]
    expect(rollArg.date_received).toBe("2026-05-07")
  })

  it("rejects malformed date_received", async () => {
    const { addRoll } = await import("@/app/actions/inventory")

    await expect(
      addRoll({
        material_type: "Butyl",
        width: 60,
        length: 240,
        thickness: 0.5,
        date_received: "tomorrow",
      } as unknown as Parameters<typeof addRoll>[0])
    ).rejects.toThrow()
    expect(addRollSvcMock).not.toHaveBeenCalled()
  })

  it("rejects impossible calendar dates that pass the format regex", async () => {
    // coderabbit follow-up on PR #197: format-only validation accepted
    // values like `2026-02-31` because `Date.parse` silently rolls
    // them forward (March 3 in this case). Refine catches the rollover.
    const { addRoll } = await import("@/app/actions/inventory")

    for (const bad of ["2026-02-31", "2026-13-01", "2026-04-31", "2026-00-15"]) {
      await expect(
        addRoll({
          material_type: "Butyl",
          width: 60,
          length: 240,
          thickness: 0.5,
          date_received: bad,
        } as unknown as Parameters<typeof addRoll>[0])
      ).rejects.toThrow()
    }
    expect(addRollSvcMock).not.toHaveBeenCalled()
  })

  it("does not let the client smuggle status / part_number / is_offcut / user_id", async () => {
    const { addRoll } = await import("@/app/actions/inventory")

    // Cast through unknown to simulate a malicious / non-TypeScript
    // client serializing extra fields. Zod's strip behavior must drop
    // them before the service call so derived fields stay derived.
    const maliciousInput = {
      material_type: "Butyl",
      width: 60,
      length: 240,
      thickness: 0.5,
      status: "depleted",
      part_number: "ATTACKER-001",
      is_offcut: true,
      user_id: "different-user",
    } as unknown as Parameters<typeof addRoll>[0]

    await addRoll(maliciousInput)

    const rollArg = addRollSvcMock.mock.calls[0][0]
    const userIdArg = addRollSvcMock.mock.calls[0][1]
    // Status is derived, always "active" — not the smuggled "depleted"
    expect(rollArg.status).toBe("active")
    // None of the smuggled fields reach the service
    expect(rollArg).not.toHaveProperty("part_number")
    expect(rollArg).not.toHaveProperty("is_offcut")
    expect(rollArg).not.toHaveProperty("user_id")
    // userId comes from the actor, not the smuggled value
    expect(userIdArg).toBe(ACTOR.id)
    expect(userIdArg).not.toBe("different-user")
  })

  it("rejects callers without manageRolls permission", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })
    const { addRoll } = await import("@/app/actions/inventory")

    await expect(
      addRoll({ material_type: "Butyl", width: 60, length: 240, thickness: 0.5 })
    ).rejects.toThrow("forbidden")
    expect(addRollSvcMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("rejects unauthenticated callers", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { addRoll } = await import("@/app/actions/inventory")

    await expect(
      addRoll({ material_type: "Butyl", width: 60, length: 240, thickness: 0.5 })
    ).rejects.toThrow("unauth")
    expect(addRollSvcMock).not.toHaveBeenCalled()
  })

  it("rejects non-positive dimensions", async () => {
    const { addRoll } = await import("@/app/actions/inventory")

    await expect(
      addRoll({ material_type: "Butyl", width: 0, length: 240, thickness: 0.5 })
    ).rejects.toThrow()
    await expect(
      addRoll({ material_type: "Butyl", width: 60, length: -1, thickness: 0.5 })
    ).rejects.toThrow()
    expect(addRollSvcMock).not.toHaveBeenCalled()
  })

  it("rejects empty material_type", async () => {
    const { addRoll } = await import("@/app/actions/inventory")

    await expect(
      addRoll({ material_type: "", width: 60, length: 240, thickness: 0.5 })
    ).rejects.toThrow()
    expect(addRollSvcMock).not.toHaveBeenCalled()
  })

  it("accepts and forwards optional fields when provided", async () => {
    const { addRoll } = await import("@/app/actions/inventory")

    await addRoll({
      material_type: "Butyl",
      width: 60,
      length: 240,
      thickness: 0.5,
      color: "black",
      location: "Bay A",
      supplier: "Acme",
      cost_per_sqft: 1.25,
      notes: "Sample batch",
    })

    const rollArg = addRollSvcMock.mock.calls[0][0]
    expect(rollArg).toMatchObject({
      color: "black",
      location: "Bay A",
      supplier: "Acme",
      cost_per_sqft: 1.25,
      notes: "Sample batch",
    })
  })
})
