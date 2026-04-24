import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"

type AlertSeverity = "low" | "medium" | "high" | "critical"
type AlertStatus = "active" | "investigating"

interface AlertRow {
  id: string
  service_name: string | null
  severity: AlertSeverity
  title: string
  message: string | null
  status: AlertStatus
  triggered_at: string
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved_by: string | null
  resolved_at: string | null
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient } = guard.ctx

  const { data, error } = await adminClient
    .schema("admin")
    .from("alerts")
    .select("id, service_name, severity, title, message, status, triggered_at, acknowledged_by, acknowledged_at, resolved_by, resolved_at")
    .in("status", ["active", "investigating"])
    .order("triggered_at", { ascending: false })
  //500 error if query fails; otherwise return array of alerts (possibly empty)
  //if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    alerts: (data as AlertRow[]) ?? [],
    fetchedAt: new Date().toISOString(),
  })
}
