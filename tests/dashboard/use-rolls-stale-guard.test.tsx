/**
 * Phase 6 PR 3 — pins the "latest query wins" semantics of `useRolls`.
 *
 * Before this PR the hook fired `rollsSdk.list({ q })` on every
 * keystroke with no abort and no sequence guard, so a slow earlier
 * response could land after a fast later one and overwrite the list
 * with stale data. The fix added a `requestIdRef` counter that bumps
 * on every fetch start; only the response matching the most-recent
 * id is allowed to commit state.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { act, renderHook } from "@testing-library/react"

import type { Roll } from "@/src/infrastructure/models/supabase"

const listMock = vi.fn()

vi.mock("@/src/infrastructure/api-client/rf/inventory", () => ({
  rolls: {
    list: (...args: unknown[]) => listMock(...args),
  },
}))

// Import the hook AFTER the mock is registered.
import { useRolls } from "@/app/dashboard/inventory/_components/use-rolls"

function makeRoll(id: string, remaining = 100): Roll {
  return {
    id,
    user_id: "user-test",
    part_number: id.toUpperCase(),
    material_type: "EPDM",
    width: 36,
    length: 240,
    thickness: 0.125,
    remaining_length: remaining,
    location: "A-1",
    status: "active",
    date_received: "2026-01-01",
    cost_per_sqft: 1,
    is_offcut: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }
}

describe("useRolls — latest-query-wins guard", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    listMock.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("drops a stale response when a later fetch resolves first", async () => {
    // First call (q="q1") returns a deferred promise we resolve later.
    // Second call (q="q2") returns immediately. Then we resolve the
    // first — its stale data must NOT overwrite the second's data.
    let resolveFirst: (rolls: Roll[]) => void = () => undefined
    const firstPromise = new Promise<Roll[]>((res) => {
      resolveFirst = res
    })
    listMock
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => Promise.resolve([makeRoll("fresh-1"), makeRoll("fresh-2")]))

    const { result, rerender } = renderHook(({ q }) => useRolls(q), {
      initialProps: { q: "q1" },
    })

    // Trigger the first (slow) debounced fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(listMock).toHaveBeenCalledTimes(1)

    // Trigger the second (fast) debounced fetch — resolves immediately.
    rerender({ q: "q2" })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(listMock).toHaveBeenCalledTimes(2)
    expect(result.current.rolls.map((r) => r.id)).toEqual(["fresh-1", "fresh-2"])

    // NOW resolve the slow first request with what would be stale data.
    await act(async () => {
      resolveFirst([makeRoll("stale-1"), makeRoll("stale-2")])
      await vi.advanceTimersByTimeAsync(0)
    })

    // Stale response was dropped — the fresh result still wins.
    expect(result.current.rolls.map((r) => r.id)).toEqual(["fresh-1", "fresh-2"])
  })
})
