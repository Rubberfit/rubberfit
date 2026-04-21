import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"

// GET /api/admin/health/timeseries
// Returns the last N response_ms values for a given service, ordered oldest→newest
// for left-to-right sparkline rendering.
//
// Query params:
//   service  — service_name to query (required)
//   points   — number of data points, 1–168, default 24

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

  const service = request.nextUrl.searchParams.get("service")
  if (!service) {
    return NextResponse.json({ error: "Missing required param: service" }, { status: 400 })
  }

  const rawPoints = parseInt(request.nextUrl.searchParams.get("points") ?? "24", 10)
  const points = Math.min(Math.max(isNaN(rawPoints) ? 24 : rawPoints, 1), 168)

  const { data, error } = await adminClient.rpc("get_health_timeseries", {
    p_service_name: service,
    p_points: points,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // RPC returns newest-first; reverse so sparkline reads left=oldest, right=newest
  const rows = (data as Array<{ response_ms: number | null }> | null) ?? []
  const responseTimes = rows
    .slice()
    .reverse()
    .map(r => r.response_ms ?? 0)

  return NextResponse.json({
    service,
    responseTimes,
    fetchedAt: new Date().toISOString(),
  })
}
