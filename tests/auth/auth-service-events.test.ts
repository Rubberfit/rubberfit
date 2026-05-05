/**
 * Service-level test for authService.onAuthStateChange — pins the
 * mapping from Supabase AuthChangeEvent to AuthContext callback.
 *
 * The previous implementation only handled SIGNED_IN, PASSWORD_RECOVERY,
 * and SIGNED_OUT. Cold loads (INITIAL_SESSION), token refreshes
 * (TOKEN_REFRESHED), and profile updates (USER_UPDATED) silently
 * dropped on the floor, leaving AuthContext to do a separate
 * getCurrentUser() round trip and to drift out of sync after refresh.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"

const { onSupabaseAuthStateChange, profileSelectMaybeSingle } = vi.hoisted(
  () => ({
    onSupabaseAuthStateChange: vi.fn(),
    profileSelectMaybeSingle: vi.fn(),
  })
)

// Mock the supabase client surface used by authService — auth events
// plus the profiles-table chain that buildAuthUser walks for roles.
vi.mock("@/src/infrastructure/models/supabase", () => {
  const profilesChain = {
    select: () => ({
      eq: () => ({ maybeSingle: profileSelectMaybeSingle }),
    }),
  }
  return {
    supabase: {
      auth: { onAuthStateChange: onSupabaseAuthStateChange },
      from: () => profilesChain,
    },
  }
})

vi.mock("@/app/lib/app-url", () => ({
  getBrowserAppUrl: (p: string) => `http://localhost:3000${p}`,
}))

// Real polyfill needed — authService uses tsyringe's @injectable.
import "reflect-metadata"
import { authService } from "@/src/infrastructure/services/authService"

type SupabaseAuthHandler = (
  event: string,
  session: { user: { id: string; email: string; created_at: string } } | null
) => Promise<void> | void

const FIXTURE_USER = {
  id: "u1",
  email: "alice@example.com",
  created_at: "2026-01-01T00:00:00Z",
  user_metadata: {},
  app_metadata: {},
} as const

beforeEach(() => {
  vi.clearAllMocks()
  profileSelectMaybeSingle.mockResolvedValue({
    data: { roles: ["member"], super_admin: false },
    error: null,
  })
})

function captureSupabaseHandler() {
  let captured: SupabaseAuthHandler | null = null
  onSupabaseAuthStateChange.mockImplementation((handler: SupabaseAuthHandler) => {
    captured = handler
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  return () => {
    if (!captured) {
      throw new Error("Supabase onAuthStateChange handler never registered")
    }
    return captured
  }
}

describe("authService.onAuthStateChange: event mapping", () => {
  it("propagates INITIAL_SESSION with a user", async () => {
    const getHandler = captureSupabaseHandler()
    const callback = vi.fn()

    authService.onAuthStateChange(callback)
    await getHandler()("INITIAL_SESSION", { user: FIXTURE_USER })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1", email: "alice@example.com" })
    )
  })

  it("propagates INITIAL_SESSION with null when no session exists", async () => {
    const getHandler = captureSupabaseHandler()
    const callback = vi.fn()

    authService.onAuthStateChange(callback)
    await getHandler()("INITIAL_SESSION", null)

    expect(callback).toHaveBeenCalledExactlyOnceWith(null)
  })

  it("propagates SIGNED_IN", async () => {
    const getHandler = captureSupabaseHandler()
    const callback = vi.fn()

    authService.onAuthStateChange(callback)
    await getHandler()("SIGNED_IN", { user: FIXTURE_USER })

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" })
    )
  })

  it("propagates SIGNED_OUT as null", async () => {
    const getHandler = captureSupabaseHandler()
    const callback = vi.fn()

    authService.onAuthStateChange(callback)
    await getHandler()("SIGNED_OUT", null)

    expect(callback).toHaveBeenCalledExactlyOnceWith(null)
  })

  it("propagates TOKEN_REFRESHED so AuthContext re-syncs roles after rotation", async () => {
    const getHandler = captureSupabaseHandler()
    const callback = vi.fn()

    authService.onAuthStateChange(callback)
    await getHandler()("TOKEN_REFRESHED", { user: FIXTURE_USER })

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1", roles: ["member"] })
    )
  })

  it("does NOT log out the user when TOKEN_REFRESHED fires with no session (transient refresh blip)", async () => {
    // Regression check: Supabase has been observed firing
    // TOKEN_REFRESHED with session=null during refresh-failure.
    // Treating that as a logout would evict logged-in users mid-
    // session. We wait for an actual SIGNED_OUT instead.
    const getHandler = captureSupabaseHandler()
    const callback = vi.fn()

    authService.onAuthStateChange(callback)
    await getHandler()("TOKEN_REFRESHED", null)

    expect(callback).not.toHaveBeenCalled()
  })

  it("does NOT log out the user when USER_UPDATED fires with no session", async () => {
    const getHandler = captureSupabaseHandler()
    const callback = vi.fn()

    authService.onAuthStateChange(callback)
    await getHandler()("USER_UPDATED", null)

    expect(callback).not.toHaveBeenCalled()
  })

  it("propagates USER_UPDATED so profile metadata changes are picked up", async () => {
    profileSelectMaybeSingle.mockResolvedValue({
      data: { roles: ["admin"], super_admin: true },
      error: null,
    })
    const getHandler = captureSupabaseHandler()
    const callback = vi.fn()

    authService.onAuthStateChange(callback)
    await getHandler()("USER_UPDATED", { user: FIXTURE_USER })

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ["admin"], isSuperAdmin: true })
    )
  })

  it("propagates PASSWORD_RECOVERY", async () => {
    const getHandler = captureSupabaseHandler()
    const callback = vi.fn()

    authService.onAuthStateChange(callback)
    await getHandler()("PASSWORD_RECOVERY", { user: FIXTURE_USER })

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" })
    )
  })

  it("ignores events that don't change identity (e.g. MFA_CHALLENGE_VERIFIED)", async () => {
    const getHandler = captureSupabaseHandler()
    const callback = vi.fn()

    authService.onAuthStateChange(callback)
    await getHandler()("MFA_CHALLENGE_VERIFIED", { user: FIXTURE_USER })

    expect(callback).not.toHaveBeenCalled()
  })

  it("getProfileRoles errors are swallowed by buildAuthUser — callback still fires with default roles", async () => {
    // Pinned existing behavior: getProfileRoles catches its own
    // errors and returns default roles, so a DB blip on the profiles
    // table doesn't break sign-in.
    profileSelectMaybeSingle.mockRejectedValue(new Error("db down"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const getHandler = captureSupabaseHandler()
    const callback = vi.fn()

    authService.onAuthStateChange(callback)
    await expect(
      getHandler()("SIGNED_IN", { user: FIXTURE_USER })
    ).resolves.not.toThrow()

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" })
    )

    errorSpy.mockRestore()
  })

  it("fails closed (callback(null)) if buildAuthUser itself throws", async () => {
    // Defense-in-depth: if the handler's await throws (something
    // outside getProfileRoles' own catch), we must not leave
    // AuthContext stuck on loading=true. The catch should propagate
    // null so the spinner clears and the user re-authenticates.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const getHandler = captureSupabaseHandler()
    const callback = vi.fn()

    // Force buildAuthUser to throw by making `user.email` access
    // raise (the buildAuthUser body does `user.email!`).
    const poisonedUser = new Proxy(FIXTURE_USER, {
      get(target, prop) {
        if (prop === "email") {
          throw new Error("boom")
        }
        return Reflect.get(target, prop)
      },
    })

    authService.onAuthStateChange(callback)
    await getHandler()("SIGNED_IN", { user: poisonedUser as never })

    expect(callback).toHaveBeenCalledExactlyOnceWith(null)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
