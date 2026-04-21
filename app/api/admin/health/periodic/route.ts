import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"

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
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

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
