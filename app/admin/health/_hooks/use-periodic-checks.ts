"use client"

import { useState, useEffect, useCallback } from "react"

export type CheckStatus = "operational" | "degraded" | "down" | "unknown"

export interface PeriodicCheck {
  id:           number
  serviceName:  string
  checkedAt:    string
  status:       CheckStatus
  responseMs:   number | null
  httpStatus:   number | null
  detail:       string
  isTransition: boolean
}

export interface UptimeSummary {
  overall24h: number
  overall7d:  number
  overall30d: number
}

export interface UsePeriodicChecksReturn {
  checks:    PeriodicCheck[]
  uptime:    UptimeSummary | null
  isLoading: boolean
  error:     string | null
  refresh:   () => Promise<void>
}

interface RawCheck {
  id:            number
  service_name:  string
  checked_at:    string
  status:        string
  response_ms:   number | null
  http_status:   number | null
  detail:        string | null
  is_transition: boolean
}

interface PeriodicResponse {
  uptime: {
    overall24h: number
    overall7d:  number
    overall30d: number
  }
  checks: RawCheck[]
}

function toCheckStatus(raw: string): CheckStatus {
  if (raw === "operational") return "operational"
  if (raw === "degraded")    return "degraded"
  if (raw === "down")        return "down"
  return "unknown"
}

function fmtRelative(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)  return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24)  return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

function mapCheck(r: RawCheck): PeriodicCheck {
  return {
    id:           r.id,
    serviceName:  r.service_name,
    checkedAt:    fmtRelative(r.checked_at),
    status:       toCheckStatus(r.status),
    responseMs:   r.response_ms,
    httpStatus:   r.http_status,
    detail:       r.detail ?? "",
    isTransition: r.is_transition,
  }
}

export function usePeriodicChecks(): UsePeriodicChecksReturn {
  const [checks,    setChecks]    = useState<PeriodicCheck[]>([])
  const [uptime,    setUptime]    = useState<UptimeSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/health/periodic")
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      const data = await res.json() as PeriodicResponse
      setChecks(data.checks.map(mapCheck))
      setUptime({
        overall24h: data.uptime.overall24h,
        overall7d:  data.uptime.overall7d,
        overall30d: data.uptime.overall30d,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch periodic checks")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  return { checks, uptime, isLoading, error, refresh: fetchData }
}
