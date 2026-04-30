import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import { healthCheckService } from "@/src/infrastructure/services/healthCheckService"
import type { CheckResult } from "@/src/application/services/health-check.service.interface"

// HTTP probes only — no Supabase queries. We hit Supabase REST/Storage/
// Auth endpoints directly via fetch so the check is end-to-end.

async function checkApiGateway(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "API Gateway"
  if (!url || !key)
    return {
      serviceName: name,
      status: "unknown",
      responseMs: null,
      detail: "SUPABASE_URL not configured",
    }
  const start = Date.now()
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(8000),
    })
    const responseMs = Date.now() - start
    if (!res.ok)
      return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 2000)
      return {
        serviceName: name,
        status: "degraded",
        responseMs,
        detail: `High latency (${responseMs}ms)`,
      }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return {
      serviceName: name,
      status: "down",
      responseMs: Date.now() - start,
      detail: err instanceof Error ? err.message : "Connection failed",
    }
  }
}

async function checkAuthService(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "Auth Service"
  if (!url || !key)
    return {
      serviceName: name,
      status: "unknown",
      responseMs: null,
      detail: "SUPABASE_URL not configured",
    }
  const start = Date.now()
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(8000),
    })
    const responseMs = Date.now() - start
    if (!res.ok)
      return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 2000)
      return {
        serviceName: name,
        status: "degraded",
        responseMs,
        detail: `High latency (${responseMs}ms)`,
      }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return {
      serviceName: name,
      status: "down",
      responseMs: Date.now() - start,
      detail: err instanceof Error ? err.message : "Connection failed",
    }
  }
}

async function checkDatabasePrimary(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "Database Primary"
  if (!url || !key)
    return {
      serviceName: name,
      status: "unknown",
      responseMs: null,
      detail: "SUPABASE_URL not configured",
    }
  const start = Date.now()
  try {
    const res = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      method: "HEAD",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    })
    const responseMs = Date.now() - start
    if (!res.ok)
      return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 2000)
      return {
        serviceName: name,
        status: "degraded",
        responseMs,
        detail: `High latency (${responseMs}ms)`,
      }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return {
      serviceName: name,
      status: "down",
      responseMs: Date.now() - start,
      detail: err instanceof Error ? err.message : "Connection failed",
    }
  }
}

async function checkFileStorage(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "File Storage"
  if (!url || !key)
    return {
      serviceName: name,
      status: "unknown",
      responseMs: null,
      detail: "SUPABASE_URL not configured",
    }
  const start = Date.now()
  try {
    const res = await fetch(`${url}/storage/v1/bucket`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    })
    const responseMs = Date.now() - start
    if (!res.ok)
      return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 2000)
      return {
        serviceName: name,
        status: "degraded",
        responseMs,
        detail: `High latency (${responseMs}ms)`,
      }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return {
      serviceName: name,
      status: "down",
      responseMs: Date.now() - start,
      detail: err instanceof Error ? err.message : "Connection failed",
    }
  }
}

async function checkJobQueue(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const name = "Job Queue"
  if (!url || !key)
    return {
      serviceName: name,
      status: "unknown",
      responseMs: null,
      detail: "SUPABASE_URL not configured",
    }
  const start = Date.now()
  try {
    const res = await fetch(`${url}/rest/v1/notification_queue?select=id&limit=1`, {
      method: "HEAD",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    })
    const responseMs = Date.now() - start
    if (!res.ok)
      return { serviceName: name, status: "down", responseMs, detail: `HTTP ${res.status}` }
    if (responseMs > 2000)
      return {
        serviceName: name,
        status: "degraded",
        responseMs,
        detail: `High latency (${responseMs}ms)`,
      }
    return { serviceName: name, status: "operational", responseMs, detail: "OK" }
  } catch (err) {
    return {
      serviceName: name,
      status: "down",
      responseMs: Date.now() - start,
      detail: err instanceof Error ? err.message : "Connection failed",
    }
  }
}

async function checkEmailService(): Promise<CheckResult> {
  const name = "Email Service"
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey)
    return {
      serviceName: name,
      status: "unknown",
      responseMs: null,
      detail: "RESEND_API_KEY not configured",
    }
  const start = Date.now()
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    const responseMs = Date.now() - start
    if (res.status === 401)
      return { serviceName: name, status: "down", responseMs, detail: "Invalid API key" }
    if (!res.ok)
      return { serviceName: name, status: "degraded", responseMs, detail: `HTTP ${res.status}` }
    return { serviceName: name, status: "operational", responseMs, detail: "API key valid" }
  } catch (err) {
    return {
      serviceName: name,
      status: "down",
      responseMs: Date.now() - start,
      detail: err instanceof Error ? err.message : "Connection failed",
    }
  }
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<{ results: CheckResult[]; checkedAt: string } | { error: string }>> {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

  const results = await Promise.all([
    checkApiGateway(),
    checkDatabasePrimary(),
    checkAuthService(),
    checkFileStorage(),
    checkJobQueue(),
    checkEmailService(),
  ])

  const persisted = await healthCheckService.persistCheckResults(adminClient, results)
  if (!persisted.ok) {
    return NextResponse.json({ error: persisted.error }, { status: 500 })
  }

  return NextResponse.json({ results, checkedAt: new Date().toISOString() })
}
