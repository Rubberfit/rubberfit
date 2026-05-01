import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import { healthCheckService } from "@/src/infrastructure/services/healthCheckService"

interface RawEndpoint {
  id: string
  service_name: string
  description: string
  method: string
  check_type: string
  current_status: string | null
  last_checked_at: string | null
  avg_response_ms: number | null
}

interface EndpointsResponse {
  endpoints: RawEndpoint[]
  fetchedAt: string
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<EndpointsResponse | { error: string }>> {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

  try {
    const rows = await healthCheckService.listEndpointsWithStatus(adminClient)
    const endpoints: RawEndpoint[] = rows.map((row) => ({
      id: row.id,
      service_name: row.service_name,
      description: row.description,
      method: row.method,
      check_type: row.check_type,
      current_status: row.current_status,
      last_checked_at: row.last_checked_at,
      avg_response_ms:
        row.avg_response_ms_24h !== null ? Math.round(row.avg_response_ms_24h) : null,
    }))
    return NextResponse.json({
      endpoints,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
