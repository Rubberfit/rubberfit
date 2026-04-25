import { NextRequest, NextResponse } from "next/server"
import { makeAuthClient, makeAdminClient } from "@/src/infrastructure/supabase/server-clients"

interface UptimeRow {
  service_name:        string
  uptime_24h:          number | null
  uptime_7d:           number | null
  uptime_30d:          number | null
  avg_response_ms_24h: number | null
  last_checked_at:     string | null
  current_status:      string | null
}

interface CheckRow {
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
    overall24h:  number
    overall7d:   number
    overall30d:  number
    perService:  UptimeRow[]
  }
  checks:    CheckRow[]
  fetchedAt: string
}

function avg(nums: (number | null)[]): number {
  const valid = nums.filter((n): n is number => n !== null)
  if (valid.length === 0) return 0
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<PeriodicResponse | { error: string }>> {
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

  const [uptimeResult, checksResult] = await Promise.all([
    adminClient.rpc("get_all_endpoint_uptime"),
    adminClient.rpc("get_recent_health_checks", { p_limit: 50 }),
  ])

  if (uptimeResult.error) return NextResponse.json({ error: uptimeResult.error.message }, { status: 500 })
  if (checksResult.error) return NextResponse.json({ error: checksResult.error.message }, { status: 500 })

  const perService = (uptimeResult.data as UptimeRow[]) ?? []

  return NextResponse.json({
    uptime: {
      overall24h: avg(perService.map((r) => r.uptime_24h)),
      overall7d:  avg(perService.map((r) => r.uptime_7d)),
      overall30d: avg(perService.map((r) => r.uptime_30d)),
      perService,
    },
    checks:    (checksResult.data as CheckRow[]) ?? [],
    fetchedAt: new Date().toISOString(),
  })
}
