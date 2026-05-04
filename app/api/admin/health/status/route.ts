import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import { healthCheckService } from "@/src/infrastructure/services/healthCheckService"

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

  try {
    const [services, incidents] = await Promise.all([
      healthCheckService.getHealthStatus(adminClient, SERVICE_NAMES),
      healthCheckService.getHealthIncidents(adminClient, SERVICE_NAMES, 20),
    ])
    return NextResponse.json({
      services,
      incidents,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
