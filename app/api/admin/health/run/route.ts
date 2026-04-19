import { NextRequest, NextResponse } from "next/server"
import { makeAuthClient, makeAdminClient } from "@/src/infrastructure/supabase/server-clients"

// Types

type CheckStatus = "operational" | "degraded" | "down" | "unknown"

interface CheckResult {
  serviceName: string
  status: CheckStatus
  responseMs: number | null
  detail: string
  httpStatus?: number
}

interface EndpointRow {
  id: string
  service_name: string
  current_status: string | null
}

const SERVICE_NAMES = [
  "API Gateway",
  "Database Primary",
  "Job Queue",
  "File Storage",
  "Auth Service",
  "Email Service",
] as const

// Individual health checks

async function checkApiGateway(): Promise<CheckResult> {
  const url   = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name  = "API Gateway"
  if (!url || !key) return { serviceName: name, status: "unknown", responseMs: null, detail: "SUPABASE_URL not configured" }
  const start = Date.now()
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(5000),
    })
    const responseMs = Date.now() - start
    if (!res.ok)          return { serviceName: name, status: "down",      responseMs, detail: `HTTP ${res.status}`, httpStatus: res.status }
    if (responseMs > 1000) return { serviceName: name, status: "degraded", responseMs, detail: `High latency (${responseMs}ms)` }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Connection failed" }
  }
}

type AdminClient = NonNullable<ReturnType<typeof makeAdminClient>>

async function checkDatabase(client: AdminClient): Promise<CheckResult> {
  const name  = "Database Primary"
  const start = Date.now()
  try {
    const { error } = await client.from("profiles").select("id").limit(1)
    const responseMs = Date.now() - start
    if (error)             return { serviceName: name, status: "down",      responseMs, detail: error.message }
    if (responseMs > 500)  return { serviceName: name, status: "degraded", responseMs, detail: `High latency (${responseMs}ms)` }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Query failed" }
  }
}

async function checkJobQueue(client: AdminClient): Promise<CheckResult> {
  const name  = "Job Queue"
  const start = Date.now()
  try {
    const { data, error } = await client
      .from("notification_queue")
      .select("status")
      .in("status", ["pending", "failed", "processing"])
    const responseMs = Date.now() - start
    if (error) return { serviceName: name, status: "down", responseMs, detail: error.message }
    const rows    = data ?? []
    const failed  = rows.filter(r => r.status === "failed").length
    const pending = rows.filter(r => r.status === "pending").length
    if (failed  > 5)   return { serviceName: name, status: "degraded", responseMs, detail: `${failed} failed jobs in queue` }
    if (pending > 100) return { serviceName: name, status: "degraded", responseMs, detail: `High queue depth: ${pending} pending` }
    return { serviceName: name, status: "operational", responseMs, detail: `${pending} pending, ${failed} failed` }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Queue check failed" }
  }
}

async function checkFileStorage(client: AdminClient): Promise<CheckResult> {
  const name  = "File Storage"
  const start = Date.now()
  try {
    const { data, error } = await client.storage.listBuckets()
    const responseMs = Date.now() - start
    if (error) return { serviceName: name, status: "down", responseMs, detail: error.message }
    return { serviceName: name, status: "operational", responseMs, detail: `${(data ?? []).length} buckets accessible` }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Storage check failed" }
  }
}

async function checkAuthService(client: AdminClient): Promise<CheckResult> {
  const name  = "Auth Service"
  const start = Date.now()
  try {
    const { error } = await client.auth.admin.listUsers({ perPage: 1 })
    const responseMs = Date.now() - start
    if (error)             return { serviceName: name, status: "down",      responseMs, detail: error.message }
    if (responseMs > 1000) return { serviceName: name, status: "degraded", responseMs, detail: `High latency (${responseMs}ms)` }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Auth check failed" }
  }
}

async function checkEmailService(): Promise<CheckResult> {
  const name   = "Email Service"
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { serviceName: name, status: "unknown", responseMs: null, detail: "RESEND_API_KEY not configured" }
  const start  = Date.now()
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    const responseMs = Date.now() - start
    if (res.status === 401) return { serviceName: name, status: "down",      responseMs, detail: "Invalid API key",  httpStatus: 401 }
    if (!res.ok)            return { serviceName: name, status: "degraded",  responseMs, detail: `HTTP ${res.status}`, httpStatus: res.status }
    return { serviceName: name, status: "operational", responseMs, detail: "API key valid" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Email check failed" }
  }
}

// POST /api/admin/health/run 

export async function POST(request: NextRequest) {
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

  // Run all checks concurrently
  const results = await Promise.all([
    checkApiGateway(),
    checkDatabase(adminClient),
    checkJobQueue(adminClient),
    checkFileStorage(adminClient),
    checkAuthService(adminClient),
    checkEmailService(),
  ])

  // Get endpoint IDs and their last-known status
  const { data: endpoints, error: epError } = await adminClient.rpc("get_health_endpoint_ids", {
    p_names: [...SERVICE_NAMES],
  })
  if (epError) return NextResponse.json({ error: epError.message }, { status: 500 })

  const endpointMap = new Map((endpoints as EndpointRow[]).map(e => [e.service_name, e]))

  // Build insert payload
  const inserts = results
    .map(r => {
      const ep = endpointMap.get(r.serviceName)
      if (!ep) return null
      return {
        endpoint_id:   ep.id,
        status:        r.status,
        response_ms:   r.responseMs,
        http_status:   r.httpStatus ?? null,
        detail:        r.detail,
        is_transition: ep.current_status !== null && ep.current_status !== r.status,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (inserts.length > 0) {
    const { error: insertError } = await adminClient.rpc("record_health_checks", { p_checks: inserts })
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ results, checkedAt: new Date().toISOString() })
}
