"use client"

import { useState, useEffect, useCallback } from "react"
import type { DashboardResponse, DashboardService, DashboardIncident } from "@/app/api/admin/health/dashboard/route"

export type { DashboardService, DashboardIncident }

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
