import { NextRequest, NextResponse } from "next/server"
import { makeAuthClient, makeAdminClient } from "@/src/infrastructure/supabase/server-clients"
// Create interface of the endpoint data structure returned 
// by the API, and the format expected by the frontend component. 
// This allows us to transform the raw data from the database into a format 
// that's easier for the frontend to work with.
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

// This is the format that the frontend component will use
interface EndpointsResponse {
  endpoints: RawEndpoint[]
  fetchedAt: string
}

// Mock endpoints configuration — in production, fetch from a database table
// This is hardcoded here for simplicity, but ideally this would be stored in a database table
const CONFIGURED_ENDPOINTS: RawEndpoint[] = [
  {
    id: "supabase-db",
    service_name: "Supabase DB",
    description: "SELECT 1 ping via REST",
    method: "SQL",
    icon: "🛢",
    current_status: "operational",
    last_checked_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    avg_response_ms: 6,
  },
  {
    id: "supabase-auth",
    service_name: "Supabase Auth",
    description: "Token validation endpoint",
    method: "POST /auth/v1/token",
    icon: "🛡️",
    current_status: "operational",
    last_checked_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    avg_response_ms: 42,
  },
  {
    id: "edge-functions",
    service_name: "Edge Functions",
    description: "Invoke health check function",
    method: "POST /functions/v1/health",
    icon: "⚡",
    current_status: "degraded",
    last_checked_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    avg_response_ms: 310,
  },
  {
    id: "frontend",
    service_name: "Frontend",
    description: "HTTP 200 on deployed URL",
    method: "GET /",
    icon: "🌐",
    current_status: "operational",
    last_checked_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    avg_response_ms: 88,
  },
  {
    id: "email-resend",
    service_name: "Email (Resend)",
    description: "API key validation check",
    method: "GET /v1/domains",
    icon: "📧",
    current_status: "operational",
    last_checked_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    avg_response_ms: 134,
  },
  {
    id: "stripe",
    service_name: "Stripe",
    description: "API connectivity check",
    method: "GET /v1/balance",
    icon: "🔑",
    current_status: "unknown",
    last_checked_at: null,
    avg_response_ms: null,
  },
]
// In a real implementation, the GET handler would fetch the latest status of each endpoint from the database
export async function GET(request: NextRequest): Promise<NextResponse<EndpointsResponse | { error: string }>> {
  //basic auth and role check
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
  // End of auth checks
  return NextResponse.json({
    endpoints: CONFIGURED_ENDPOINTS,
    fetchedAt: new Date().toISOString(),
  })
}
