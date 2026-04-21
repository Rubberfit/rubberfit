"use client"

import { useCallback, useEffect, useState } from "react"

import { rolls as rollsSdk } from "@/src/infrastructure/api-client/rf/inventory"
import type { Roll } from "@/src/infrastructure/models/supabase"

/**
 * Single source of truth for the inventory landing page. The table
 * and the header actions (export, etc.) both need the same list of
 * rolls — without this hook the page used to trigger two separate
 * fetches. Consumers that only need to trigger a refresh can call
 * `refresh()` instead of bumping a numeric key.
 */

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

  const fetchRolls = useCallback(
    async (query: string) => {
      setLoading(true)
      setError(null)
      try {
        const data = query ? await rollsSdk.list({ q: query }) : await rollsSdk.list()
        setRolls(data ?? [])
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    fetchRolls(searchQuery)
  }, [fetchRolls, searchQuery])

  const refresh = useCallback(() => fetchRolls(searchQuery), [fetchRolls, searchQuery])

  return { rolls, loading, error, refresh }
}
