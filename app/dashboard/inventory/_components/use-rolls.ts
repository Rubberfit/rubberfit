"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { rolls as rollsSdk } from "@/src/infrastructure/api-client/rf/inventory"
import type { Roll } from "@/src/infrastructure/models/supabase"
import { useDebouncedValue } from "@/app/hooks/use-debounced-value"

/**
 * Single source of truth for the inventory landing page. The table
 * and the header actions (export, etc.) both need the same list of
 * rolls — without this hook the page used to trigger two separate
 * fetches. Consumers that only need to trigger a refresh can call
 * `refresh()` instead of bumping a numeric key.
 *
 * Phase 6 PR 3 — search now debounces by 250ms. Before this PR every
 * keystroke fired a Supabase fetch, so rapid typing produced a stack
 * of concurrent in-flight requests that could land out of order. A
 * `requestIdRef` sequence guard now drops every response except the
 * latest, so even mid-flight cancellations (which the API client
 * doesn't support yet) can't poison the list.
 */

const SEARCH_DEBOUNCE_MS = 250

export interface UseRollsState {
  rolls: Roll[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useRolls(searchQuery: string = ""): UseRollsState {
  const [rolls, setRolls] = useState<Roll[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const debouncedQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS)

  const fetchRolls = useCallback(async (query: string) => {
    // Bump the sequence so any in-flight fetch from a prior keystroke
    // becomes stale and its response is dropped. Without this, a slow
    // earlier request resolving AFTER a faster later request would
    // overwrite the visible list with stale data.
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const data = query ? await rollsSdk.list({ q: query }) : await rollsSdk.list()
      if (requestId !== requestIdRef.current) return
      setRolls(data ?? [])
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      const message = err instanceof Error ? err.message : "Unknown error"
      setError(message)
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetchRolls(debouncedQuery)
  }, [fetchRolls, debouncedQuery])

  // `refresh()` uses the LIVE query (not the debounced copy) so a
  // manual refresh fires immediately against whatever the operator
  // currently has typed, instead of waiting for the debounce window.
  const refresh = useCallback(() => fetchRolls(searchQuery), [fetchRolls, searchQuery])

  return { rolls, loading, error, refresh }
}
