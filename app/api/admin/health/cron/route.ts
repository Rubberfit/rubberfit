import "reflect-metadata";
import { NextRequest, NextResponse } from "next/server"
import { makeAdminClient } from "@/src/infrastructure/supabase/server-clients"
import { runHealthCheck } from "@/src/infrastructure/services/healthCheckAdapters"
import { healthAlertService } from "@/src/infrastructure/services/healthAlertService"
import type { AdapterCheckInput, CheckStatus } from "@/src/application/services/health-check-adapter.interface"

// Types

type Tier = "critical" | "standard" | "extended"

interface ActiveEndpointRow {
  id: string
  service_name: string
  check_type: string
  method: string
  url: string
  tier: string
  interval_seconds: number | null
  expected_status: number | null
  secret_ref: string | null
  current_status: string | null
}

interface InsertRow {
  endpoint_id: string
  status: CheckStatus
  response_ms: number | null
  http_status: number | null
  detail: string
  is_transition: boolean
}

// POST /api/admin/health/cron 
// Called by Vercel Cron on three schedules (critical/standard/extended).
// Authenticated via Authorization: Bearer <CRON_SECRET> header.
// Query param: ?tier=critical|standard|extended (default: critical)

export async function POST(request: NextRequest) {
  const start = Date.now()

  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const adminClient = makeAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: "Service role key not configured" }, { status: 500 })
  }

  const tierParam = request.nextUrl.searchParams.get("tier") ?? "critical"
  const tier: Tier =
    tierParam === "standard" || tierParam === "extended" ? tierParam : "critical"

  // Fetch all active endpoints from DB
  const { data: endpoints, error: epError } = await adminClient.rpc(
    "get_active_health_endpoints"
  )
  if (epError) {
    return NextResponse.json({ error: epError.message }, { status: 500 })
  }

  const rows = (endpoints as ActiveEndpointRow[]).filter(ep => ep.tier === tier)

  if (rows.length === 0) {
    return NextResponse.json({ checked: 0, transitions: 0, tier, durationMs: Date.now() - start })
  }

  // Run all checks for this tier concurrently
  const inputs: AdapterCheckInput[] = rows.map(ep => ({
    id: ep.id,
    serviceName: ep.service_name,
    checkType: ep.check_type as AdapterCheckInput["checkType"],
    url: ep.url ?? "",
    method: ep.method ?? "GET",
    expectedStatus: ep.expected_status,
    secretRef: ep.secret_ref,
    currentStatus: ep.current_status as CheckStatus | null,
  }))

  const results = await Promise.all(inputs.map(input => runHealthCheck(input, adminClient)))

  // Build insert payload
  const inserts: InsertRow[] = results.map(r => ({
    endpoint_id: r.endpointId,
    status: r.status,
    response_ms: r.responseMs,
    http_status: r.httpStatus,
    detail: r.detail,
    is_transition: r.isTransition,
  }))

  const { error: insertError } = await adminClient.rpc("record_health_checks", {
    p_checks: inserts,
  })
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Fire alerts for down/degraded transitions
  const now = new Date().toISOString()
  const transitionResults = results.filter(
    r => r.isTransition && (r.status === "down" || r.status === "degraded")
  )

  await Promise.allSettled(
    transitionResults.map(r =>
      healthAlertService.maybeFire({
        serviceName: r.serviceName,
        status: r.status as "down" | "degraded",
        detail: r.detail,
        responseMs: r.responseMs,
        checkedAt: now,
      })
    )
  )

  return NextResponse.json({
    checked: results.length,
    transitions: transitionResults.length,
    tier,
    durationMs: Date.now() - start,
  })
}
