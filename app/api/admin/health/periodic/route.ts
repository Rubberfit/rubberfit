import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import { healthCheckService } from "@/src/infrastructure/services/healthCheckService"
import type { CheckRow, UptimeRow } from "@/src/application/services/health-check.service.interface"

interface PeriodicResponse {
  uptime: {
    overall24h: number
    overall7d: number
    overall30d: number
    perService: UptimeRow[]
  }
  checks: CheckRow[]
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

  try {
    const [perService, checks] = await Promise.all([
      healthCheckService.getAllEndpointUptime(adminClient),
      healthCheckService.getRecentChecks(adminClient, 50),
    ])

    return NextResponse.json({
      uptime: {
        overall24h: avg(perService.map((r) => r.uptime_24h)),
        overall7d: avg(perService.map((r) => r.uptime_7d)),
        overall30d: avg(perService.map((r) => r.uptime_30d)),
        perService,
      },
      checks,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
