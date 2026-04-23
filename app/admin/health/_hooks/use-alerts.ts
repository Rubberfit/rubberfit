"use client"

import { useState, useEffect, useCallback } from "react"

export type AlertSeverity = "low" | "medium" | "high" | "critical"
export type AlertStatus = "active" | "investigating" | "resolved" | "suppressed"

export interface HealthAlert {
  id: string
  service_name: string | null
  severity: AlertSeverity
  title: string
  message: string | null
  status: AlertStatus
  triggered_at: string
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved_by: string | null
  resolved_at: string | null
}

interface AlertsResponse {
  alerts: HealthAlert[]
  fetchedAt: string
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<HealthAlert[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/alerts")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as AlertsResponse
      setAlerts(json.alerts)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAlerts()
  }, [fetchAlerts])

  const acknowledge = useCallback(
    async (id: string) => {
      // Optimistic update
      setAlerts(prev =>
        prev.map(a => (a.id === id ? { ...a, status: "investigating" as AlertStatus } : a))
      )
      try {
        const res = await fetch(`/api/admin/alerts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "acknowledge" }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        await fetchAlerts()
      } catch (_error) {
        // Revert optimistic update on failure
        await fetchAlerts()
      }
    },
    [fetchAlerts]
  )

  const resolve = useCallback(
    async (id: string) => {
      // Optimistic update — resolved alerts disappear from active list
      setAlerts(prev => prev.filter(a => a.id !== id))
      try {
        const res = await fetch(`/api/admin/alerts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve" }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch (_error) {
        await fetchAlerts()
      }
    },
    [fetchAlerts]
  )

  return { alerts, isLoading, error, acknowledge, resolve, refetch: fetchAlerts }
}
