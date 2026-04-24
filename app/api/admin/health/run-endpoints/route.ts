import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"

type CheckStatus = "operational" | "degraded" | "down" | "unknown"

interface CheckResult {
  serviceName: string
  status: CheckStatus
  responseMs: number | null
  detail: string
}

// Individual health checks

// Probes are named to match the seeded rows in admin.health_endpoints so the
// results actually land against the right UI cards. Latency thresholds were
// also bumped — 300ms was unrealistic for cold Vercel → Supabase round-trips.

async function checkApiGateway(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "API Gateway"
  if (!url || !key) return { serviceName: name, status: "unknown", responseMs: null, detail: "SUPABASE_URL not configured" }
  const start = Date.now()
  try {
    // `/auth/v1/health` is the known-good public GoTrue liveness ping
    // (same endpoint the Auth Service probe uses). Since every Supabase
    // service sits behind the same gateway, a GoTrue-up response proves
    // the gateway layer is reachable.
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(8000),
    })
    const responseMs = Date.now() - start
    if (!res.ok) return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 2000) return { serviceName: name, status: "degraded", responseMs, detail: `High latency (${responseMs}ms)` }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Connection failed" }
  }
}

async function checkAuthService(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "Auth Service"
  if (!url || !key) return { serviceName: name, status: "unknown", responseMs: null, detail: "SUPABASE_URL not configured" }
  const start = Date.now()
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(8000),
    })
    const responseMs = Date.now() - start
    if (!res.ok) return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 2000) return { serviceName: name, status: "degraded", responseMs, detail: `High latency (${responseMs}ms)` }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Connection failed" }
  }
}

async function checkDatabasePrimary(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "Database Primary"
  if (!url || !key) return { serviceName: name, status: "unknown", responseMs: null, detail: "SUPABASE_URL not configured" }
  const start = Date.now()
  try {
    // HEAD on any PostgREST table is the cheapest liveness probe.
    const res = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      method: "HEAD",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    })
    const responseMs = Date.now() - start
    if (!res.ok) return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 2000) return { serviceName: name, status: "degraded", responseMs, detail: `High latency (${responseMs}ms)` }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Connection failed" }
  }
}

async function checkFileStorage(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "File Storage"
  if (!url || !key) return { serviceName: name, status: "unknown", responseMs: null, detail: "SUPABASE_URL not configured" }
  const start = Date.now()
  try {
    const res = await fetch(`${url}/storage/v1/bucket`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    })
    const responseMs = Date.now() - start
    if (!res.ok) return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 2000) return { serviceName: name, status: "degraded", responseMs, detail: `High latency (${responseMs}ms)` }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Connection failed" }
  }
}

async function checkJobQueue(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "Job Queue"
  if (!url || !key) return { serviceName: name, status: "unknown", responseMs: null, detail: "SUPABASE_URL not configured" }
  const start = Date.now()
  try {
    const res = await fetch(
      `${url}/rest/v1/notification_queue?select=id&limit=1`,
      { method: "HEAD", headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) }
    )
    const responseMs = Date.now() - start
    if (!res.ok) return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 2000) return { serviceName: name, status: "degraded", responseMs, detail: `High latency (${responseMs}ms)` }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Connection failed" }
  }
}

async function checkFrontend(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "http://localhost:3000"
  const name = "Frontend"
  const start = Date.now()
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    })
    const responseMs = Date.now() - start
    if (!res.ok) return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 1000) return { serviceName: name, status: "degraded", responseMs, detail: `High latency (${responseMs}ms)` }
    return { serviceName: name, status: "operational", responseMs, detail: "HTTP 200" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Connection failed" }
  }
}

async function checkEmailService(): Promise<CheckResult> {
  const name = "Email Service"
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { serviceName: name, status: "unknown", responseMs: null, detail: "RESEND_API_KEY not configured" }
  const start = Date.now()
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    const responseMs = Date.now() - start
    if (res.status === 401) return { serviceName: name, status: "down", responseMs, detail: "Invalid API key" }
    if (!res.ok) return { serviceName: name, status: "degraded", responseMs, detail: `HTTP ${res.status}` }
    return { serviceName: name, status: "operational", responseMs, detail: "API key valid" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Connection failed" }
  }
}

async function checkStripe(): Promise<CheckResult> {
  const name = "Stripe"
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) return { serviceName: name, status: "unknown", responseMs: null, detail: "STRIPE_SECRET_KEY not configured" }
  const start = Date.now()
  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(5000),
    })
    const responseMs = Date.now() - start
    if (res.status === 401) return { serviceName: name, status: "down", responseMs, detail: "Invalid API key" }
    if (!res.ok) return { serviceName: name, status: "degraded", responseMs, detail: `HTTP ${res.status}` }
    return { serviceName: name, status: "operational", responseMs, detail: "API accessible" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Connection failed" }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<{ results: CheckResult[]; checkedAt: string } | { error: string }>> {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

  // Run all endpoint checks in parallel. Names here match the seeded rows in
  // admin.health_endpoints so results bind to the right UI cards.
  const results = await Promise.all([
    checkApiGateway(),
    checkDatabasePrimary(),
    checkAuthService(),
    checkFileStorage(),
    checkJobQueue(),
    checkEmailService(),
  ])

  // Resolve endpoint UUIDs and last-known statuses
  const serviceNames = results.map(r => r.serviceName)
  const { data: endpoints, error: epError } = await adminClient.rpc("get_health_endpoint_ids", {
    p_names: serviceNames,
  })
  if (epError) return NextResponse.json({ error: epError.message }, { status: 500 })

  interface EndpointRow { id: string; service_name: string; current_status: string | null }
  const endpointMap = new Map((endpoints as EndpointRow[]).map(e => [e.service_name, e]))

  const inserts = results
    .map(r => {
      const ep = endpointMap.get(r.serviceName)
      if (!ep) return null
      return {
        endpoint_id:   ep.id,
        status:        r.status,
        response_ms:   r.responseMs,
        http_status:   null,
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
