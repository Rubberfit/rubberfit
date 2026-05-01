import { NextRequest, NextResponse } from "next/server"

import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import { healthCheckService } from "@/src/infrastructure/services/healthCheckService"

// All probe + persist logic lives in `healthCheckService`. This route
// just authenticates, fans out the probes in parallel, persists the
// results, and returns the snapshot.
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

  const results = await Promise.all([
    healthCheckService.checkApiGateway(),
    healthCheckService.checkDatabase(),
    healthCheckService.checkJobQueue(),
    healthCheckService.checkFileStorage(),
    healthCheckService.checkAuthService(),
    healthCheckService.checkEmailService(),
  ])

  const persisted = await healthCheckService.persistCheckResults(adminClient, results)
  if (!persisted.ok) {
    console.error("admin/health/run persist error:", persisted.error)
    return NextResponse.json({ error: "Failed to persist health checks" }, { status: 500 })
  }

  return NextResponse.json({ results, checkedAt: new Date().toISOString() })
}
