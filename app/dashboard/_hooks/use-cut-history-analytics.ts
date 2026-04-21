"use client"

import { useCallback, useEffect, useState } from "react"

import type { CutHistory } from "@/src/entities"

interface UseCutHistoryAnalyticsParams {
  from: Date
  to: Date
}

interface UseCutHistoryAnalyticsResult {
  data: CutHistory[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useCutHistoryAnalytics({
  from,
  to,
}: UseCutHistoryAnalyticsParams): UseCutHistoryAnalyticsResult {
  const [data, setData] = useState<CutHistory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Stabilize on ISO strings so callers don't need to memoize Date objects
  const fromISO = from.toISOString()
  const toISO = new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString()

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from: fromISO, to: toISO })
      const res = await fetch(`/api/analytics/cut-history?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`)
      }
      const json = (await res.json()) as { data: CutHistory[] }
      setData(json.data)
    } catch (err) {
      console.error("Error fetching cut history analytics:", err)
      setError(err instanceof Error ? err.message : "Failed to load analytics data")
      setData([])
    } finally {
      setIsLoading(false)
    }
  }, [fromISO, toISO])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, isLoading, error, refetch: fetchData }
}
