import { NextRequest, NextResponse } from "next/server"
import { makeAuthClient, makeAdminClient } from "@/src/infrastructure/supabase/server-clients"

interface DbEndpointStatus {
  id: string
  service_name: string
  check_type: string
  current_status: string | null
  last_checked_at: string | null
  avg_response_ms_24h: number | null
}

interface DbUptimeRow {
  service_name:        string
  uptime_24h:          number | null
  uptime_7d:           number | null
  uptime_30d:          number | null
  avg_response_ms_24h: number | null
  last_checked_at:     string | null
  current_status:      string | null
}

interface DbCheckRow {
  id:            number
  service_name:  string
  checked_at:    string
  status:        string
  response_ms:   number | null
  http_status:   number | null
  detail:        string | null
  is_transition: boolean
}

interface DbTimeseriesRow {
  service_name: string
  response_ms:  number | null
  checked_at:   string
}

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

export async function GET(
  request: NextRequest
): Promise<NextResponse<DashboardResponse | { error: string }>> {
  const authClient = makeAuthClient(request)
  if (!authClient) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })

  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const adminClient = makeAdminClient()
  if (!adminClient) return NextResponse.json({ error: "Service role key not configured" }, { status: 500 })

  const { data: profile } = await adminClient
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single()
  const roles = profile?.roles
  if (!Array.isArray(roles) || !roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const [endpointsResult, uptimeResult, checksResult, timeseriesResult] = await Promise.all([
    adminClient.rpc("get_health_endpoints_with_status"),
    adminClient.rpc("get_all_endpoint_uptime"),
    adminClient.rpc("get_recent_health_checks", { p_limit: 100 }),
    adminClient.rpc("get_all_health_timeseries", { p_points: 24 }),
  ])

  if (endpointsResult.error)  return NextResponse.json({ error: endpointsResult.error.message  }, { status: 500 })
  if (uptimeResult.error)     return NextResponse.json({ error: uptimeResult.error.message     }, { status: 500 })
  if (checksResult.error)     return NextResponse.json({ error: checksResult.error.message     }, { status: 500 })
  if (timeseriesResult.error) return NextResponse.json({ error: timeseriesResult.error.message }, { status: 500 })

  const endpointRows = (endpointsResult.data as DbEndpointStatus[]) ?? []
  const uptimeMap    = new Map(((uptimeResult.data as DbUptimeRow[]) ?? []).map(r => [r.service_name, r]))

  const timeseriesMap = new Map<string, number[]>()
  for (const row of (timeseriesResult.data as DbTimeseriesRow[]) ?? []) {
    const arr = timeseriesMap.get(row.service_name) ?? []
    arr.push(row.response_ms ?? 0)
    timeseriesMap.set(row.service_name, arr)
  }

  const services: DashboardService[] = endpointRows.map(ep => {
    const uptime = uptimeMap.get(ep.service_name)
    return {
      serviceName:   ep.service_name,
      checkType:     ep.check_type,
      currentStatus: ep.current_status ?? uptime?.current_status ?? null,
      uptime24h:     uptime?.uptime_24h     ?? null,
      uptime7d:      uptime?.uptime_7d      ?? null,
      uptime30d:     uptime?.uptime_30d     ?? null,
      avgResponseMs: ep.avg_response_ms_24h !== null
        ? Math.round(ep.avg_response_ms_24h)
        : uptime?.avg_response_ms_24h !== null && uptime?.avg_response_ms_24h !== undefined
          ? Math.round(uptime.avg_response_ms_24h)
          : null,
      lastCheckedAt: ep.last_checked_at ?? uptime?.last_checked_at ?? null,
      timeseries:    timeseriesMap.get(ep.service_name) ?? [],
    }
  })

  const incidents: DashboardIncident[] = ((checksResult.data as DbCheckRow[]) ?? [])
    .filter(r => r.is_transition)
    .slice(0, 20)
    .map(r => ({
      serviceName: r.service_name,
      checkedAt:   r.checked_at,
      status:      r.status,
      detail:      r.detail ?? "",
    }))

  return NextResponse.json({ services, incidents, fetchedAt: new Date().toISOString() })
}
