import { NextRequest, NextResponse } from "next/server"

import { makeAdminClient, makeAuthClient } from "@/src/infrastructure/supabase/server-clients"

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
  const authClient = makeAuthClient(request)
  if (!authClient) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })

  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const adminClient = makeAdminClient()
  if (!adminClient) return NextResponse.json({ error: "Service role key not configured" }, { status: 500 })

  const { data: profile } = await adminClient.from("profiles").select("roles").eq("id", user.id).single()
  const roles = profile?.roles
  if (!Array.isArray(roles) || !roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

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
