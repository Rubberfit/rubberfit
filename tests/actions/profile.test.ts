/**
 * Self-delete action tests.
 *
 * What we're enforcing:
 *   - Target identity comes from the session, NOT from caller input.
 *     `requireAuthenticatedUser` returns the actor; the action
 *     forwards `actor.id` to the repository — there's no userId
 *     parameter that could be spoofed.
 *   - Auth must succeed before the soft-delete write fires.
 *   - Repository failures are sanitized: the client receives a
 *     stable message, not raw Supabase error text (V7.4).
 *   - Success returns `{ ok: true }`; the card chains signOut on
 *     this exact shape.
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

const requestSelfDeleteRepoMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/repositories/profiles.repository", () => ({
  profileRepository: {
    requestSelfDelete: requestSelfDeleteRepoMock,
  },
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-0000-0000-0000000000aa",
  email: "user@example.com",
  roles: ["member"],
  isSuperAdmin: false,
}

describe("app/actions/profile.requestSelfDelete", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requestSelfDeleteRepoMock.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("forwards the actor's id to the repository — no caller input accepted", async () => {
    const { requestSelfDelete } = await import("@/app/actions/profile")

    const result = await requestSelfDelete()

    expect(requestSelfDeleteRepoMock).toHaveBeenCalledWith(ACTOR.id)
    expect(result).toEqual({ ok: true })
  })

  it("registers the DB factory and authenticates BEFORE the soft-delete write", async () => {
    const { requestSelfDelete } = await import("@/app/actions/profile")

    await requestSelfDelete()

    // Both ran before the write
    expect(ensureDatabaseFactoryRegisteredMock).toHaveBeenCalledOnce()
    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    // Order: auth resolves, then repo gets called
    const authCallOrder = requireAuthenticatedUserMock.mock.invocationCallOrder[0]
    const repoCallOrder = requestSelfDeleteRepoMock.mock.invocationCallOrder[0]
    expect(authCallOrder).toBeLessThan(repoCallOrder)
  })

  it("rejects unauthenticated callers without writing", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { requestSelfDelete } = await import("@/app/actions/profile")

    await expect(requestSelfDelete()).rejects.toThrow("unauth")
    expect(requestSelfDeleteRepoMock).not.toHaveBeenCalled()
  })

  it("returns a sanitized error when the repo fails — no raw error leaks", async () => {
    requestSelfDeleteRepoMock.mockResolvedValue({
      success: false,
      error: 'duplicate key value violates unique constraint "profiles_pkey"',
    })
    const { requestSelfDelete } = await import("@/app/actions/profile")

    const result = await requestSelfDelete()

    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.error).not.toContain("duplicate key")
      expect(result.error).not.toContain("profiles_pkey")
      // Stable, user-facing copy
      expect(result.error).toMatch(/contact support/i)
    }
  })
})
