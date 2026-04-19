import { NextRequest, NextResponse } from "next/server"
import { makeAuthClient, makeAdminClient } from "@/src/infrastructure/supabase/server-clients"

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

  const { data, error } = await adminClient.rpc("get_health_endpoints_with_status")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    endpoints:  ((data as DbEndpoint[]) ?? []).map(toRawEndpoint),
    fetchedAt:  new Date().toISOString(),
  })
}
