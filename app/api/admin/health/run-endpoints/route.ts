import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import { healthCheckService } from "@/src/infrastructure/services/healthCheckService"
import type { CheckResult } from "@/src/application/services/health-check.service.interface"

// Same probe set as `/api/admin/health/run`. Both routes exist for
// historical reasons; the probe + persist logic lives in
// `healthCheckService` so the routes are thin orchestrators.
export async function POST(
  request: NextRequest
): Promise<NextResponse<{ results: CheckResult[]; checkedAt: string } | { error: string }>> {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

  const results = await Promise.all([
    healthCheckService.checkApiGateway(),
    healthCheckService.checkDatabase(),
    healthCheckService.checkAuthService(),
    healthCheckService.checkFileStorage(),
    healthCheckService.checkJobQueue(),
    healthCheckService.checkEmailService(),
  ])

  const persisted = await healthCheckService.persistCheckResults(adminClient, results)
  if (!persisted.ok) {
    console.error("admin/health/run-endpoints persist error:", persisted.error)
    return NextResponse.json({ error: "Failed to persist health checks" }, { status: 500 })
  }

  return NextResponse.json({ results, checkedAt: new Date().toISOString() })
}
