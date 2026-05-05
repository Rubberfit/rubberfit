/**
 * Stress tests for ProtectedRoute's 8s spinner backstop.
 *
 * The backstop is defense-in-depth: if AuthContext's bootstrap timeout
 * somehow doesn't fire, ProtectedRoute should still bail out of an
 * indefinite spinner and force the user to /login.
 *
 * `useAuth` is mocked here so we can hold `loading=true` past the 8s
 * threshold — the real AuthContext would clear loading at 5s, which
 * would preempt the backstop and make this test impossible.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import * as React from "react"
import { act, render, screen } from "@testing-library/react"

const { useAuthMock, routerReplace, canAccessPath } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  routerReplace: vi.fn(),
  canAccessPath: vi.fn(() => true),
}))

vi.mock("@/app/contexts/AuthContext", () => ({
  useAuth: useAuthMock,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
  usePathname: () => "/dashboard",
}))

vi.mock("@/app/lib/rbac", () => ({ canAccessPath }))

vi.mock("@/app/components/ui/spinner", () => ({
  Spinner: () => <div data-testid="spinner" />,
}))

import { ProtectedRoute } from "@/app/(auth)/auth/ProtectedRoute"

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setAuthSnapshot(snapshot: {
  user: { id: string; roles: string[] } | null
  loading: boolean
}) {
  useAuthMock.mockReturnValue(snapshot)
}

describe("ProtectedRoute: 8s spinner backstop", () => {
  it("redirects to /login after 8s if loading never clears", async () => {
    setAuthSnapshot({ loading: true, user: null })

    render(
      <ProtectedRoute>
        <div data-testid="children">protected</div>
      </ProtectedRoute>
    )

    expect(screen.queryByTestId("spinner")).not.toBeNull()
    expect(routerReplace).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7999)
    })
    expect(routerReplace).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2)
    })
    expect(routerReplace).toHaveBeenCalledWith("/login")
  })

  it("does NOT redirect if loading clears before backstop fires", async () => {
    // Initial render: loading=true.
    setAuthSnapshot({ loading: true, user: null })
    const { rerender } = render(
      <ProtectedRoute>
        <div data-testid="children">protected</div>
      </ProtectedRoute>
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000)
    })
    expect(routerReplace).not.toHaveBeenCalled()

    // Auth resolves with a user before the 8s backstop fires.
    setAuthSnapshot({
      loading: false,
      user: { id: "u1", roles: ["member"] },
    })
    rerender(
      <ProtectedRoute>
        <div data-testid="children">protected</div>
      </ProtectedRoute>
    )

    // Even after we cross the original 8s deadline, the cleared timer
    // must not fire a redirect.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(routerReplace).not.toHaveBeenCalledWith("/login")
    expect(screen.queryByTestId("children")).not.toBeNull()
  })

  it("renders children once auth resolves and access is allowed", () => {
    canAccessPath.mockReturnValue(true)
    setAuthSnapshot({
      loading: false,
      user: { id: "u1", roles: ["member"] },
    })

    render(
      <ProtectedRoute>
        <div data-testid="children">protected</div>
      </ProtectedRoute>
    )

    expect(screen.queryByTestId("children")).not.toBeNull()
    expect(screen.queryByTestId("spinner")).toBeNull()
    expect(routerReplace).not.toHaveBeenCalled()
  })

  it("redirects to /unauthorized when authed but missing role", async () => {
    canAccessPath.mockReturnValue(false)
    setAuthSnapshot({
      loading: false,
      user: { id: "u1", roles: ["viewer"] },
    })

    render(
      <ProtectedRoute>
        <div data-testid="children">protected</div>
      </ProtectedRoute>
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(routerReplace).toHaveBeenCalledWith("/unauthorized")
  })

  it("does not double-arm the timer across re-renders within one loading cycle", async () => {
    // Regression check: rapid re-renders while loading=true should
    // share a single 8s deadline, not stack multiple timers.
    setAuthSnapshot({ loading: true, user: null })
    const { rerender } = render(
      <ProtectedRoute>
        <div data-testid="children">protected</div>
      </ProtectedRoute>
    )

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      rerender(
        <ProtectedRoute>
          <div data-testid="children">protected</div>
        </ProtectedRoute>
      )
    }
    // Total elapsed: 5000ms. Backstop should not have fired.
    expect(routerReplace).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3001)
    })
    // Total elapsed: 8001ms — backstop fires exactly once.
    expect(routerReplace).toHaveBeenCalledTimes(1)
    expect(routerReplace).toHaveBeenCalledWith("/login")
  })
})
