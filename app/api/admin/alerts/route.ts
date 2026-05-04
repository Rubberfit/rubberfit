import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import { alertManagementService } from "@/src/infrastructure/services/alertManagementService"

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

  const alerts = await alertManagementService.listOpenAlerts(adminClient)
  return NextResponse.json({
    alerts,
    fetchedAt: new Date().toISOString(),
  })
}
