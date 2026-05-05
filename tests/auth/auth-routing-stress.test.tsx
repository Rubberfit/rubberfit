/**
 * Stress tests for the AuthContext + createSignIn fixes plus the
 * tightened authService.onAuthStateChange event handling.
 *
 * Bug summary: protected routes spinner-locked indefinitely because
 * AuthContext's `loading` could get stuck `true`. Causes fixed:
 *  (1) `createSignIn` set `loading=true` then `router.push`'d without
 *      ever calling `setLoading(false)`. The destination layout's
 *      ProtectedRoute mounted with loading=true and only unstuck when
 *      onAuthStateChange fired, which is delayed/best-effort.
 *  (2) `authService.onAuthStateChange` ignored INITIAL_SESSION,
 *      TOKEN_REFRESHED, and USER_UPDATED — so AuthContext could not
 *      rely on the subscription for cold-load state, had to make a
 *      separate getCurrentUser() round trip, and lost in-memory
 *      sync after token/profile updates.
 *  (3) AuthContext's bootstrap fetch had no timeout and no
 *      cancellation — Supabase getUser() hangs would freeze the app.
 *
 * Each test exercises an exact adversarial timing observed in prod,
 * with fake timers to make the race conditions deterministic.
 *
 * (ProtectedRoute's own backstop is covered separately in
 * protected-route-stress.test.tsx.)
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { act, render, screen } from "@testing-library/react"

const {
  getCurrentUser,
  onAuthStateChange,
  signIn,
  isChallengeRequired,
  getPrimaryFactor,
  routerPush,
  routerReplace,
  resolvePostAuthRedirect,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  signIn: vi.fn(),
  isChallengeRequired: vi.fn(),
  getPrimaryFactor: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  resolvePostAuthRedirect: vi.fn(() => "/dashboard"),
}))

vi.mock("@/src/infrastructure/services/authService", () => ({
  authService: { getCurrentUser, onAuthStateChange, signIn },
}))

vi.mock("@/src/infrastructure/services/authMfaService", () => ({
  authMfaService: { isChallengeRequired, getPrimaryFactor },
}))

vi.mock("@/app/lib/auth-redirect", () => ({
  resolvePostAuthRedirect,
  sanitizeRedirectPath: (p: string | null | undefined) => p ?? null,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}))

vi.mock("reflect-metadata", () => ({})) // DI side-effect import not needed here.

import { AuthProvider, useAuth } from "@/app/contexts/AuthContext"
import { createSignIn } from "@/app/contexts/auth-actions"

type AuthCallback = (user: { id: string; email: string; roles: string[] } | null) => void

function setupSubscription() {
  const unsubscribe = vi.fn()
  let captured: AuthCallback | null = null
  onAuthStateChange.mockImplementation((cb: AuthCallback) => {
    captured = cb
    return { data: { subscription: { unsubscribe } } }
  })
  return {
    unsubscribe,
    fire: (user: { id: string; email: string; roles: string[] } | null) => {
      if (!captured) throw new Error("onAuthStateChange callback never registered")
      captured(user)
    },
  }
}

function AuthProbe() {
  const { user, loading } = useAuth()
  return (
    <div>
      <span data-testid="loading">{loading ? "true" : "false"}</span>
      <span data-testid="user">{user ? user.id : "null"}</span>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── 1. AuthContext bootstrap timeout — the bleeding wound ─────────────

describe("AuthContext: bootstrap timeout", () => {
  it("clears loading after 5s when no auth event ever fires", async () => {
    // Adversarial: Supabase never emits INITIAL_SESSION (init bug,
    // network stall). Without the backstop, every protected route
    // spins forever.
    setupSubscription()

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    expect(screen.getByTestId("loading").textContent).toBe("true")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999)
    })
    expect(screen.getByTestId("loading").textContent).toBe("true")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2)
    })
    expect(screen.getByTestId("loading").textContent).toBe("false")
    expect(screen.getByTestId("user").textContent).toBe("null")
  })

  it("clears loading immediately when INITIAL_SESSION fires with a user", async () => {
    const sub = setupSubscription()

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )
    expect(screen.getByTestId("loading").textContent).toBe("true")

    // Simulate INITIAL_SESSION firing right after subscribe — the
    // common cold-load path.
    await act(async () => {
      sub.fire({ id: "u1", email: "a@b.c", roles: [] })
    })

    expect(screen.getByTestId("loading").textContent).toBe("false")
    expect(screen.getByTestId("user").textContent).toBe("u1")
  })

  it("clears loading with null user when INITIAL_SESSION fires with no session", async () => {
    const sub = setupSubscription()

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    await act(async () => {
      sub.fire(null)
    })

    expect(screen.getByTestId("loading").textContent).toBe("false")
    expect(screen.getByTestId("user").textContent).toBe("null")
  })

  it("subsequent SIGNED_IN / SIGNED_OUT events update state", async () => {
    const sub = setupSubscription()

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    // Cold load: no session.
    await act(async () => {
      sub.fire(null)
    })
    expect(screen.getByTestId("user").textContent).toBe("null")

    // User signs in — subscription delivers the new state.
    await act(async () => {
      sub.fire({ id: "u1", email: "a@b.c", roles: [] })
    })
    expect(screen.getByTestId("user").textContent).toBe("u1")

    // User signs out.
    await act(async () => {
      sub.fire(null)
    })
    expect(screen.getByTestId("user").textContent).toBe("null")
  })

  it("does not warn about setState on an unmounted component when an event fires after unmount", async () => {
    const sub = setupSubscription()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { unmount } = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    unmount()

    await act(async () => {
      // Late event after unmount — cancelled flag should suppress.
      sub.fire({ id: "u1", email: "a@b.c", roles: [] })
      await vi.advanceTimersByTimeAsync(0)
    })

    const setStateWarnings = errorSpy.mock.calls.filter(
      (c) =>
        String(c[0]).includes("unmounted") ||
        String(c[0]).includes("memory leak")
    )
    expect(setStateWarnings.length).toBe(0)

    errorSpy.mockRestore()
  })

  it("unsubscribes from auth state changes on unmount", () => {
    const sub = setupSubscription()

    const { unmount } = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    expect(sub.unsubscribe).not.toHaveBeenCalled()
    unmount()
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

// ── 2. createSignIn — the post-login hang fix ─────────────────────────

describe("createSignIn: clears loading before navigation", () => {
  it("calls setLoading(false) BEFORE router.push on the happy path", async () => {
    signIn.mockResolvedValue({
      user: { id: "u1", email: "a@b.c", roles: [] },
      error: null,
    })
    isChallengeRequired.mockResolvedValue(false)

    const setUser = vi.fn()
    const setLoading = vi.fn()
    const router = { push: routerPush, replace: routerReplace } as never

    const sign = createSignIn(setUser, setLoading, router)
    await sign("a@b.c", "password")

    const setLoadingFalseCallIdx = setLoading.mock.calls.findIndex(
      (c) => c[0] === false
    )
    expect(setLoadingFalseCallIdx).toBeGreaterThanOrEqual(0)

    const setLoadingFalseOrder =
      setLoading.mock.invocationCallOrder[setLoadingFalseCallIdx]
    const routerPushOrder = routerPush.mock.invocationCallOrder[0]

    expect(routerPushOrder).toBeDefined()
    expect(setLoadingFalseOrder).toBeLessThan(routerPushOrder)
  })

  it("clears loading on signIn error and does not navigate", async () => {
    signIn.mockResolvedValue({
      user: null,
      error: { message: "bad creds" },
    })

    const setUser = vi.fn()
    const setLoading = vi.fn()
    const router = { push: routerPush, replace: routerReplace } as never

    const sign = createSignIn(setUser, setLoading, router)
    const result = await sign("a@b.c", "bad")

    expect(result.success).toBe(false)
    expect(setLoading).toHaveBeenCalledWith(false)
    expect(routerPush).not.toHaveBeenCalled()
  })
})
