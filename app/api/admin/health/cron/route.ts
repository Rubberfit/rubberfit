import "reflect-metadata"
import { NextRequest, NextResponse } from "next/server"

import { makeAdminClient } from "@/src/infrastructure/supabase/server-clients"
import { runHealthCheck } from "@/src/infrastructure/services/healthCheckAdapters"
import { healthAlertService } from "@/src/infrastructure/services/healthAlertService"
import { healthCheckService } from "@/src/infrastructure/services/healthCheckService"
import type {
  AdapterCheckInput,
  CheckStatus,
} from "@/src/application/services/health-check-adapter.interface"

type Tier = "critical" | "standard" | "extended"

// POST /api/admin/health/cron — fired by Vercel Cron on three schedules
// (critical/standard/extended). Authenticated via Authorization: Bearer
// <CRON_SECRET>. Query param: ?tier=critical|standard|extended
// (default: critical).

export async function POST(request: NextRequest) {
  const start = Date.now()

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
  const tier: Tier = tierParam === "standard" || tierParam === "extended" ? tierParam : "critical"

  let endpoints
  try {
    endpoints = await healthCheckService.listActiveEndpoints(adminClient)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  const rows = endpoints.filter((ep) => ep.tier === tier)
  if (rows.length === 0) {
    return NextResponse.json({
      checked: 0,
      transitions: 0,
      tier,
      durationMs: Date.now() - start,
    })
  }

  const inputs: AdapterCheckInput[] = rows.map((ep) => ({
    id: ep.id,
    serviceName: ep.service_name,
    checkType: ep.check_type as AdapterCheckInput["checkType"],
    url: ep.url ?? "",
    method: ep.method ?? "GET",
    expectedStatus: ep.expected_status,
    secretRef: ep.secret_ref,
    currentStatus: ep.current_status as CheckStatus | null,
  }))

  const adapterResults = await Promise.all(
    inputs.map((input) => runHealthCheck(input, adminClient))
  )

  const inserts = adapterResults.map((r) => ({
    endpoint_id: r.endpointId,
    status: r.status,
    response_ms: r.responseMs,
    http_status: r.httpStatus,
    detail: r.detail,
    is_transition: r.isTransition,
  }))

  try {
    await healthCheckService.recordChecks(adminClient, inserts)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  const now = new Date().toISOString()
  const transitionResults = adapterResults.filter(
    (r) => r.isTransition && (r.status === "down" || r.status === "degraded")
  )

  await Promise.allSettled(
    transitionResults.map((r) =>
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
    checked: adapterResults.length,
    transitions: transitionResults.length,
    tier,
    durationMs: Date.now() - start,
  })
}
