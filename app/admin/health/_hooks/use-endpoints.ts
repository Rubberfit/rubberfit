"use client"

import { useState, useEffect, useCallback } from "react"

export type EndpointStatus = "operational" | "degraded" | "down" | "unknown"
export type CheckType = "http" | "db" | "storage" | "auth" | "queue"

export interface Endpoint {
  id: string
  service: string
  description: string
  method: string
  checkType: CheckType
  status: EndpointStatus
  lastChecked: string
  responseTime: string | null
}

interface RawEndpoint {
  id: string
  service_name: string
  description: string
  method: string
  check_type: string
  current_status: string | null
  last_checked_at: string | null
  avg_response_ms: number | null
}

interface EndpointsResponse {
  endpoints: RawEndpoint[]
  fetchedAt: string
}

function fmtRelativeTime(iso: string | null): string {
  if (!iso) return "Never"
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

function toEndpointStatus(raw: string | null): EndpointStatus {
  if (raw === "operational") return "operational"
  if (raw === "degraded")    return "degraded"
  if (raw === "down")        return "down"
  return "unknown"
}

function toCheckType(raw: string): CheckType {
  if (raw === "db")      return "db"
  if (raw === "storage") return "storage"
  if (raw === "auth")    return "auth"
  if (raw === "queue")   return "queue"
  return "http"
}

function mapEndpoint(r: RawEndpoint): Endpoint {
  return {
    id:           r.id,
    service:      r.service_name,
    description:  r.description,
    method:       r.method,
    checkType:    toCheckType(r.check_type),
    status:       toEndpointStatus(r.current_status),
    lastChecked:  fmtRelativeTime(r.last_checked_at),
    responseTime: r.avg_response_ms !== null ? `${r.avg_response_ms}ms` : null,
  }
}

export interface UseEndpointsReturn {
  endpoints: Endpoint[]
  isLoading: boolean
  isRunning: boolean
  error: string | null
  runChecks: () => Promise<void>
  refresh: () => Promise<void>
}

export function useEndpoints(): UseEndpointsReturn {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEndpoints = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/health/endpoints")
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      const data = await res.json() as EndpointsResponse
      setEndpoints(data.endpoints.map(mapEndpoint))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch endpoints")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const runChecks = useCallback(async () => {
    setIsRunning(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/health/run-endpoints", { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      await fetchEndpoints()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run endpoint checks")
    } finally {
      setIsRunning(false)
    }
  }, [fetchEndpoints])

  useEffect(() => {
    void fetchEndpoints()
  }, [fetchEndpoints])

  return { endpoints, isLoading, isRunning, error, runChecks, refresh: fetchEndpoints }
}
