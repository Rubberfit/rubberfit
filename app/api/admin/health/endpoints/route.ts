import { NextRequest, NextResponse } from "next/server"
import { makeAuthClient, makeAdminClient } from "@/src/infrastructure/supabase/server-clients"

interface RawEndpoint {
  id: string
  service_name: string
  description: string
  method: string
  icon: string
  current_status: string | null
  last_checked_at: string | null
  avg_response_ms: number | null
}

interface EndpointsResponse {
  endpoints: RawEndpoint[]
  fetchedAt: string
}

// Mock endpoints configuration — in production, fetch from a database table
const CONFIGURED_ENDPOINTS: RawEndpoint[] = [
  {
    id: "supabase-db",
    service_name: "Supabase DB",
    description: "SELECT 1 ping via REST",
    method: "SQL",
    icon: "Database",
    current_status: "operational",
    last_checked_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    avg_response_ms: 6,
  },
  {
    id: "supabase-auth",
    service_name: "Supabase Auth",
    description: "Token validation endpoint",
    method: "POST /auth/v1/token",
    icon: "Shield",
    current_status: "operational",
    last_checked_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    avg_response_ms: 42,
  },
  {
    id: "edge-functions",
    service_name: "Edge Functions",
    description: "Invoke health check function",
    method: "POST /functions/v1/health",
    icon: "Zap",
    current_status: "degraded",
    last_checked_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    avg_response_ms: 310,
  },
  {
    id: "frontend",
    service_name: "Frontend",
    description: "HTTP 200 on deployed URL",
    method: "GET /",
    icon: "Globe",
    current_status: "operational",
    last_checked_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    avg_response_ms: 88,
  },
  {
    id: "email-resend",
    service_name: "Email (Resend)",
    description: "API key validation check",
    method: "GET /v1/domains",
    icon: "Mail",
    current_status: "operational",
    last_checked_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    avg_response_ms: 134,
  },
  {
    id: "stripe",
    service_name: "Stripe",
    description: "API connectivity check",
    method: "GET /v1/balance",
    icon: "Key",
    current_status: "unknown",
    last_checked_at: null,
    avg_response_ms: null,
  },
]

export async function GET(request: NextRequest): Promise<NextResponse<EndpointsResponse | { error: string }>> {
  const authClient = makeAuthClient(request)
  if (!authClient) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })

  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const adminClient = makeAdminClient()
  if (!adminClient) return NextResponse.json({ error: "Service role key not configured" }, { status: 500 })

  const { data: profile } = await adminClient.from("profiles").select("roles").eq("id", user.id).single()
  const roles = profile?.roles
  if (!Array.isArray(roles) || !roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return NextResponse.json({
    endpoints: CONFIGURED_ENDPOINTS,
    fetchedAt: new Date().toISOString(),
  })
}
