import { NextRequest, NextResponse } from "next/server"
import { makeAuthClient, makeAdminClient } from "@/src/infrastructure/supabase/server-clients"

type Action = "acknowledge" | "resolve"

interface PatchBody {
  action: Action
}

function isPatchBody(value: unknown): value is PatchBody {
  if (typeof value !== "object" || value === null) return false
  const action = (value as Record<string, unknown>).action
  return action === "acknowledge" || action === "resolve"
}

// ── PATCH /api/admin/alerts/[id] ──────────────────────────────────────────────
// Acknowledge or resolve an alert. Also writes an admin_activity_log entry.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = makeAuthClient(request)
  if (!authClient) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })

  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const adminClient = makeAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: "Service role key not configured" }, { status: 500 })
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single()
  const roles = profile?.roles
  if (!Array.isArray(roles) || !roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch (_error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!isPatchBody(body)) {
    return NextResponse.json(
      { error: 'Body must be { action: "acknowledge" | "resolve" }' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const actorEmail = user.email ?? ""
  const { action } = body

  const update =
    action === "acknowledge"
      ? { status: "investigating", acknowledged_by: actorEmail, acknowledged_at: now }
      : { status: "resolved", resolved_by: actorEmail, resolved_at: now }

  const { data: updated, error: updateError } = await adminClient
    .schema("admin")
    .from("alerts")
    .update(update)
    .eq("id", id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Audit log
  await adminClient.schema("admin").from("admin_activity_log").insert({
    actor_id: user.id,
    actor_email: actorEmail,
    action: action === "acknowledge" ? "acknowledged_alert" : "resolved_alert",
    resource_type: "alert",
    resource_id: id,
    metadata: { new_status: update.status },
  })

  return NextResponse.json({ alert: updated })
}
