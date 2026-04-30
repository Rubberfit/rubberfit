import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import { alertManagementService } from "@/src/infrastructure/services/alertManagementService"
import type { AlertAction } from "@/src/application/services/alert-management.service.interface"

interface PatchBody {
  action: AlertAction
}

function isPatchBody(value: unknown): value is PatchBody {
  if (typeof value !== "object" || value === null) return false
  const action = (value as Record<string, unknown>).action
  return action === "acknowledge" || action === "resolve"
}

// PATCH /api/admin/alerts/[id] — acknowledge or resolve an alert and
// write an admin_activity_log entry via the service layer.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const result = await alertManagementService.applyAlertAction(adminClient, {
    alertId: id,
    action: body.action,
    actorUserId: userId,
    actorEmail: userEmail,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ alert: result.alert })
}
