import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"

interface UptimeRow {
  endpoint_id:         string
  service_name:        string
  tier:                string
  uptime_24h:          number | null
  uptime_7d:           number | null
  uptime_30d:          number | null
  avg_response_ms_24h: number | null
  last_checked_at:     string | null
  current_status:      string | null
}

interface IncidentRow {
  checked_at:   string
  service_name: string
  status:       string
  detail:       string | null
}

const SERVICE_NAMES = [
  "API Gateway",
  "Database Primary",
  "Job Queue",
  "File Storage",
  "Auth Service",
  "Email Service",
]

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

  const [statusResult, incidentResult] = await Promise.all([
    adminClient.rpc("get_health_status",    { p_names: SERVICE_NAMES }),
    adminClient.rpc("get_health_incidents", { p_names: SERVICE_NAMES, p_limit: 20 }),
  ])

  if (statusResult.error)   return NextResponse.json({ error: statusResult.error.message   }, { status: 500 })
  if (incidentResult.error) return NextResponse.json({ error: incidentResult.error.message }, { status: 500 })

  return NextResponse.json({
    services:   (statusResult.data   as UptimeRow[])   ?? [],
    incidents:  (incidentResult.data as IncidentRow[]) ?? [],
    fetchedAt:  new Date().toISOString(),
  })
}
