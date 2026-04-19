import { NextRequest, NextResponse } from "next/server"
import { makeAuthClient, makeAdminClient } from "@/src/infrastructure/supabase/server-clients"

type CheckStatus = "operational" | "degraded" | "down" | "unknown"

interface CheckResult {
  serviceName: string
  status: CheckStatus
  responseMs: number | null
  detail: string
}

// Individual health checks

async function checkSupabaseDb(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "Supabase DB"
  if (!url || !key) return { serviceName: name, status: "unknown", responseMs: null, detail: "SUPABASE_URL not configured" }
  const start = Date.now()
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(5000),
    })
    const responseMs = Date.now() - start
    if (!res.ok) return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 300) return { serviceName: name, status: "degraded", responseMs, detail: `High latency (${responseMs}ms)` }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Connection failed" }
  }
}

async function checkSupabaseAuth(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "Supabase Auth"
  if (!url || !key) return { serviceName: name, status: "unknown", responseMs: null, detail: "SUPABASE_URL not configured" }
  const start = Date.now()
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(5000),
    })
    const responseMs = Date.now() - start
    if (!res.ok) return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 300) return { serviceName: name, status: "degraded", responseMs, detail: `High latency (${responseMs}ms)` }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return { serviceName: name, status: "down", responseMs: Date.now() - start, detail: err instanceof Error ? err.message : "Connection failed" }
  }
}

async function checkEdgeFunctions(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "Edge Functions"
  if (!url || !key) return { serviceName: name, status: "unknown", responseMs: null, detail: "SUPABASE_URL not configured" }
  const start = Date.now()
  try {
    const res = await fetch(`${url}/functions/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(5000),
    })
    const responseMs = Date.now() - start
    if (!res.ok) return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 300) return { serviceName: name, status: "degraded", responseMs, detail: `High latency (${responseMs}ms)` }
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
  const name = "Email (Resend)"
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

export async function POST(request: NextRequest): Promise<NextResponse<{ message: string } | { error: string }>> {
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

  // Run all endpoint checks in parallel
  const results = await Promise.all([
    checkSupabaseDb(),
    checkSupabaseAuth(),
    checkEdgeFunctions(),
    checkFrontend(),
    checkEmailService(),
    checkStripe(),
  ])

  // TODO: Persist results to database if health_checks table exists
  // For now, just return success

  return NextResponse.json({ message: "Health checks completed" })
}
