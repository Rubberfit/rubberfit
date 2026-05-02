import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import { healthCheckService } from "@/src/infrastructure/services/healthCheckService"

export interface DashboardService {
  serviceName: string
  checkType: string
  currentStatus: string | null
  uptime24h: number | null
  uptime7d: number | null
  uptime30d: number | null
  avgResponseMs: number | null
  lastCheckedAt: string | null
  timeseries: number[]
}

export interface DashboardIncident {
  serviceName: string
  checkedAt: string
  status: string
  detail: string
}

export interface DashboardResponse {
  services: DashboardService[]
  incidents: DashboardIncident[]
  fetchedAt: string
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<DashboardResponse | { error: string }>> {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

  try {
    const [endpointRows, uptimeRows, checks, timeseriesRows] = await Promise.all([
      healthCheckService.listEndpointsWithStatus(adminClient),
      healthCheckService.getAllEndpointUptime(adminClient),
      healthCheckService.getRecentChecks(adminClient, 100),
      healthCheckService.getAllTimeseries(adminClient, 24),
    ])

    const uptimeMap = new Map(uptimeRows.map((r) => [r.service_name, r]))

    const timeseriesMap = new Map<string, number[]>()
    for (const row of timeseriesRows) {
      const arr = timeseriesMap.get(row.service_name) ?? []
      arr.push(row.response_ms ?? 0)
      timeseriesMap.set(row.service_name, arr)
    }

    const services: DashboardService[] = endpointRows.map((ep) => {
      const uptime = uptimeMap.get(ep.service_name)
      return {
        serviceName: ep.service_name,
        checkType: ep.check_type,
        currentStatus: ep.current_status ?? uptime?.current_status ?? null,
        uptime24h: uptime?.uptime_24h ?? null,
        uptime7d: uptime?.uptime_7d ?? null,
        uptime30d: uptime?.uptime_30d ?? null,
        avgResponseMs:
          ep.avg_response_ms_24h !== null
            ? Math.round(ep.avg_response_ms_24h)
            : uptime?.avg_response_ms_24h !== null && uptime?.avg_response_ms_24h !== undefined
              ? Math.round(uptime.avg_response_ms_24h)
              : null,
        lastCheckedAt: ep.last_checked_at ?? uptime?.last_checked_at ?? null,
        timeseries: timeseriesMap.get(ep.service_name) ?? [],
      }
    })

    const incidents: DashboardIncident[] = checks
      .filter((r) => r.is_transition)
      .slice(0, 20)
      .map((r) => ({
        serviceName: r.service_name,
        checkedAt: r.checked_at,
        status: r.status,
        detail: r.detail ?? "",
      }))

    return NextResponse.json({ services, incidents, fetchedAt: new Date().toISOString() })
  } catch (err) {
    console.error("admin/health/dashboard:", err)
    return NextResponse.json({ error: "Failed to load health dashboard" }, { status: 500 })
  }
}
