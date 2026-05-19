/**
 * Phase 6 PR 3 — pins the debounce semantics:
 *   - new value commits only after delayMs of quiet
 *   - rapid typing keeps resetting the timer (the in-between values
 *     never commit)
 *   - unmount cancels the pending commit
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { act, renderHook } from "@testing-library/react"

import { useDebouncedValue } from "@/app/hooks/use-debounced-value"

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns the initial value synchronously", () => {
    const { result } = renderHook(() => useDebouncedValue("hello", 250))
    expect(result.current).toBe("hello")
  })

  it("commits a new value after the delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), {
      initialProps: { v: "first" },
    })
    rerender({ v: "second" })
    expect(result.current).toBe("first")
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current).toBe("second")
  })

  it("resets the timer on rapid changes — intermediate values never commit", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), {
      initialProps: { v: "g" },
    })
    rerender({ v: "ge" })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender({ v: "gen" })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender({ v: "gene" })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    // Total elapsed 300ms but each rerender reset the timer to 0, so
    // we've only had 100ms of quiet since "gene". The committed value
    // is still the original.
    expect(result.current).toBe("g")
    // Now let the timer finish.
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current).toBe("gene")
  })

  it("cancels the pending commit on unmount", () => {
    const { result, rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v, 250), {
      initialProps: { v: "stable" },
    })
    rerender({ v: "transient" })
    unmount()
    // Advance past the debounce window; if cleanup failed, this would
    // throw or produce a console warning about setting state on an
    // unmounted component.
    expect(() => {
      vi.advanceTimersByTime(500)
    }).not.toThrow()
    expect(result.current).toBe("stable")
  })
})
