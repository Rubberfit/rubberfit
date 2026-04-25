import { NextRequest, NextResponse } from "next/server"
import { makeAuthClient, makeAdminClient } from "@/src/infrastructure/supabase/server-clients"

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
  const authClient = makeAuthClient(request)
  if (!authClient) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })

  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const adminClient = makeAdminClient()
  if (!adminClient) return NextResponse.json({ error: "Service role key not configured" }, { status: 500 })

  const { data: profile } = await adminClient.from("profiles").select("roles").eq("id", user.id).single()
  const roles = profile?.roles
  if (!Array.isArray(roles) || !roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

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
