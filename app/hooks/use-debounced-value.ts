"use client"

import { useEffect, useState } from "react"

/**
 * Returns a copy of `value` that lags behind by `delayMs`. The copy
 * commits only after the source value stops changing for the full
 * window — typing fast keeps resetting the timer.
 *
 * Phase 6 PR 3 — introduced for the inventory search bar, which used
 * to fire a Supabase fetch on every keystroke. Pair the returned
 * value with whichever consumer is expensive (network call, large
 * client-side filter, chart re-render). The raw `value` stays live
 * for the input element so typing remains synchronous and accessible.
 *
 * 250ms is the canonical "feels instant but isn't every keystroke"
 * window. 200-300ms is the operator-typing comfort zone; anything
 * below 150ms still triggers per-keystroke effects, anything above
 * 400ms feels sluggish.
 *
 * Caller note: pass a primitive (string / number / boolean) when
 * possible. If `value` is an object or array re-created on every
 * parent render, each render resets the timer and the debounced
 * copy will never commit. Wrap such values in `useMemo` first or
 * pass a stable id derived from them.
 *
 * @example
 *   const [search, setSearch] = useState("")
 *   const debouncedSearch = useDebouncedValue(search, 250)
 *   const { results } = useExpensiveQuery(debouncedSearch)
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
