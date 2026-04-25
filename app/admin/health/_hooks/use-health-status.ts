"use client"

import { useState, useEffect, useCallback } from "react"

// ── Shared types (re-exported so OverviewPanel can import from one place) ─────

export type ServiceStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN"

export interface HealthService {
  name:         string
  env:          string
  status:       ServiceStatus
  uptime:       string   // 24h uptime for the primary stat
  latency:      string   // avg response ms over 24h
  lastIncident: string   // relative time of last check
  uptime24h:    string
  uptime7d:     string
  uptime30d:    string
  sparklineData: number[]
}

export interface HealthIncident {
  time:        string
  service:     string
  severity:    string
  description: string
  incidentStatus: string
}

export interface UseHealthStatusReturn {
  services:    HealthService[]
  incidents:   HealthIncident[]
  isLoading:   boolean
  isRunning:   boolean
  lastChecked: string | null
  error:       string | null
  runChecks:   () => Promise<void>
  refresh:     () => Promise<void>
}

// Raw API response shapes

interface RawService {
  service_name:        string
  uptime_24h:          number | null
  uptime_7d:           number | null
  uptime_30d:          number | null
  avg_response_ms_24h: number | null
  last_checked_at:     string | null
  current_status:      string | null
}

interface RawIncident {
  checked_at:   string
  service_name: string
  status:       string
  detail:       string | null
}

interface StatusResponse {
  services:  RawService[]
  incidents: RawIncident[]
  fetchedAt: string
}

// Formatters

function fmtUptime(v: number | null): string {
  if (v === null) return "—"
  return `${v}%`
}

function fmtLatency(ms: number | null): string {
  if (ms === null) return "—"
  return `${Math.round(ms)}ms`
}

function fmtRelativeTime(iso: string | null): string {
  if (!iso) return "Never"
  const diffMs  = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)  return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr  < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

function toServiceStatus(raw: string | null): ServiceStatus {
  if (raw === "operational") return "HEALTHY"
  if (raw === "degraded")    return "DEGRADED"
  if (raw === "down")        return "DOWN"
  return "UNKNOWN"
}

function toSeverity(status: string): string {
  if (status === "down")     return "High"
  if (status === "degraded") return "Medium"
  return "Low"
}

function mapService(r: RawService, sparklineData: number[] = []): HealthService {
  return {
    name:          r.service_name,
    env:           "Production",
    status:        toServiceStatus(r.current_status),
    uptime:        fmtUptime(r.uptime_24h),
    latency:       fmtLatency(r.avg_response_ms_24h),
    lastIncident:  fmtRelativeTime(r.last_checked_at),
    uptime24h:     fmtUptime(r.uptime_24h),
    uptime7d:      fmtUptime(r.uptime_7d),
    uptime30d:     fmtUptime(r.uptime_30d),
    sparklineData,
  }
}

interface TimeseriesResponse {
  service: string
  responseTimes: number[]
}

function mapIncident(r: RawIncident): HealthIncident {
  return {
    time:           fmtRelativeTime(r.checked_at),
    service:        r.service_name,
    severity:       toSeverity(r.status),
    description:    r.detail ?? "Status changed",
    incidentStatus: r.status === "operational" ? "Resolved" : "Active",
  }
}

// Hook

export function useHealthStatus(): UseHealthStatusReturn {
  const [services,    setServices]    = useState<HealthService[]>([])
  const [incidents,   setIncidents]   = useState<HealthIncident[]>([])
  const [isLoading,   setIsLoading]   = useState(true)
  const [isRunning,   setIsRunning]   = useState(false)
  const [lastChecked, setLastChecked] = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/health/status")
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      const data = await res.json() as StatusResponse

      // Fetch timeseries for all services in parallel for sparkline charts
      const timeseriesResults = await Promise.allSettled(
        data.services.map(s =>
          fetch(`/api/admin/health/timeseries?service=${encodeURIComponent(s.service_name)}&points=24`)
            .then(r => (r.ok ? (r.json() as Promise<TimeseriesResponse>) : null))
            .catch(() => null)
        )
      )

      const sparklineMap = new Map<string, number[]>()
      timeseriesResults.forEach((result, i) => {
        if (result.status === "fulfilled" && result.value) {
          sparklineMap.set(data.services[i].service_name, result.value.responseTimes)
        }
      })

      setServices(data.services.map(s => mapService(s, sparklineMap.get(s.service_name) ?? [])))
      setIncidents(data.incidents.map(mapIncident))
      setLastChecked(data.fetchedAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const runChecks = useCallback(async () => {
    setIsRunning(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/health/run", { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run checks")
    } finally {
      setIsRunning(false)
    }
  }, [fetchStatus])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  return { services, incidents, isLoading, isRunning, lastChecked, error, runChecks, refresh: fetchStatus }
}
