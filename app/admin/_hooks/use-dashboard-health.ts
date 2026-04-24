"use client"

import { useState, useEffect, useCallback } from "react"

// Types inlined until `app/api/admin/health/dashboard/route.ts` is
// ported from the task-46 PR (admin API routes still need the
// service-layer refactor — see task #6). Keep in sync when the route
// lands.
export interface DashboardService {
  serviceName:   string
  checkType:     string
  currentStatus: string | null
  uptime24h:     number | null
  uptime7d:      number | null
  uptime30d:     number | null
  avgResponseMs: number | null
  lastCheckedAt: string | null
  timeseries:    number[]
}

export interface DashboardIncident {
  serviceName: string
  checkedAt:   string
  status:      string
  detail:      string
}

export interface DashboardResponse {
  services:  DashboardService[]
  incidents: DashboardIncident[]
  fetchedAt: string
}

export interface UseDashboardHealthReturn {
  services:  DashboardService[]
  incidents: DashboardIncident[]
  isLoading: boolean
  error:     string | null
  refresh:   () => Promise<void>
}

export function useDashboardHealth(): UseDashboardHealthReturn {
  const [services,  setServices]  = useState<DashboardService[]>([])
  const [incidents, setIncidents] = useState<DashboardIncident[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/health/dashboard")
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      const data = await res.json() as DashboardResponse
      setServices(data.services)
      setIncidents(data.incidents)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch health data")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  return { services, incidents, isLoading, error, refresh: fetchData }
}
