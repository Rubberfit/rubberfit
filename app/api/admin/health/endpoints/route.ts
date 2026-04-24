import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"

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

interface DbEndpoint {
  id: string
  service_name: string
  description: string
  method: string
  tier: string
  check_type: string
  is_active: boolean
  current_status: string | null
  last_checked_at: string | null
  avg_response_ms_24h: number | null
}

function toRawEndpoint(row: DbEndpoint): RawEndpoint {
  return {
    id:              row.id,
    service_name:    row.service_name,
    description:     row.description,
    method:          row.method,
    check_type:      row.check_type,
    current_status:  row.current_status,
    last_checked_at: row.last_checked_at,
    avg_response_ms: row.avg_response_ms_24h !== null ? Math.round(row.avg_response_ms_24h) : null,
  }
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<EndpointsResponse | { error: string }>> {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

  const { data, error } = await adminClient.rpc("get_health_endpoints_with_status")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    endpoints:  ((data as DbEndpoint[]) ?? []).map(toRawEndpoint),
    fetchedAt:  new Date().toISOString(),
  })
}
