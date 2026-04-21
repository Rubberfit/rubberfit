import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"

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
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient, userEmail, userId } = guard.ctx

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
  const actorEmail = userEmail ?? ""
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
    actor_id: userId,
    actor_email: actorEmail,
    action: action === "acknowledge" ? "acknowledged_alert" : "resolved_alert",
    resource_type: "alert",
    resource_id: id,
    metadata: { new_status: update.status },
  })

  return NextResponse.json({ alert: updated })
}
