import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAdmin } from "@/app/api/admin/_lib/require-admin"
import { alertManagementService } from "@/src/infrastructure/services/alertManagementService"

// Mirrors `AlertAction` from the alert-management service interface;
// kept literal here to avoid a runtime import of the interface module.
// .strict() rejects unknown keys with a 400 (ARC-137 / V8.2.3) — cheap
// future-proofing against mass-assignment as the alert payload grows.
const patchBodySchema = z
  .object({
    action: z.enum(["acknowledge", "resolve"]),
  })
  .strict()

// PATCH /api/admin/alerts/[id] — acknowledge or resolve an alert and
// write an admin_activity_log entry via the service layer.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return guard.response
  const { adminClient, userEmail, userId } = guard.ctx

  const { id } = await params

  let raw: unknown
  try {
    raw = await request.json()
  } catch (_error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = patchBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const result = await alertManagementService.applyAlertAction(adminClient, {
    alertId: id,
    action: parsed.data.action,
    actorUserId: userId,
    actorEmail: userEmail,
  })

  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "invalid_state" ? 409 : 500
    return NextResponse.json({ error: result.message }, { status })
  }
  return NextResponse.json({ alert: result.alert })
}
