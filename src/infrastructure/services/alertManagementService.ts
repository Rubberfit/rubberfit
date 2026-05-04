import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  AlertAction,
  AlertRow,
  AlertStatus,
  AlertUpdateResult,
  IAlertManagementService,
} from "@/src/application/services/alert-management.service.interface"

const ALERT_COLUMNS =
  "id, service_name, severity, title, message, status, triggered_at, acknowledged_by, acknowledged_at, resolved_by, resolved_at"

function buildUpdate(action: AlertAction, actorEmail: string, now: string) {
  return action === "acknowledge"
    ? { status: "investigating" as const, acknowledged_by: actorEmail, acknowledged_at: now }
    : { status: "resolved" as const, resolved_by: actorEmail, resolved_at: now }
}

function activityActionFor(action: AlertAction): string {
  return action === "acknowledge" ? "acknowledged_alert" : "resolved_alert"
}

function isTransitionAllowed(action: AlertAction, current: AlertStatus): boolean {
  return action === "acknowledge" ? current === "active" : current !== "resolved"
}

export class AlertManagementService implements IAlertManagementService {
  async listOpenAlerts(client: SupabaseClient): Promise<AlertRow[]> {
    const { data, error } = await client
      .schema("admin")
      .from("alerts")
      .select(ALERT_COLUMNS)
      .in("status", ["active", "investigating"])
      .order("triggered_at", { ascending: false })

    if (error) {
      console.error("alertManagementService.listOpenAlerts:", error)
      return []
    }
    return (data ?? []) as AlertRow[]
  }

  async applyAlertAction(
    client: SupabaseClient,
    params: {
      alertId: string
      action: AlertAction
      actorUserId: string
      actorEmail: string | null
    }
  ): Promise<AlertUpdateResult> {
    const now = new Date().toISOString()
    const actorEmail = params.actorEmail ?? ""
    const update = buildUpdate(params.action, actorEmail, now)

    const { data: existing, error: fetchError } = await client
      .schema("admin")
      .from("alerts")
      .select("status")
      .eq("id", params.alertId)
      .maybeSingle()

    if (fetchError) {
      return { ok: false, error: "internal", message: fetchError.message }
    }
    if (!existing) {
      return { ok: false, error: "not_found", message: "Alert not found" }
    }

    const currentStatus = (existing as { status: AlertStatus }).status
    if (!isTransitionAllowed(params.action, currentStatus)) {
      return {
        ok: false,
        error: "invalid_state",
        message: `Cannot ${params.action} alert in '${currentStatus}' state`,
      }
    }

    const { data: updated, error: updateError } = await client
      .schema("admin")
      .from("alerts")
      .update(update)
      .eq("id", params.alertId)
      .select()
      .single()

    if (updateError) {
      return { ok: false, error: "internal", message: updateError.message }
    }

    // Audit log — best effort; we don't fail the action if the log
    // insert fails (the action itself succeeded). Log + carry on.
    const { error: logError } = await client
      .schema("admin")
      .from("admin_activity_log")
      .insert({
        actor_id: params.actorUserId,
        actor_email: actorEmail,
        action: activityActionFor(params.action),
        resource_type: "alert",
        resource_id: params.alertId,
        metadata: { new_status: update.status },
      })
    if (logError) {
      console.error("alertManagementService.applyAlertAction (log):", logError)
    }

    return { ok: true, alert: updated as AlertRow }
  }
}

export const alertManagementService = new AlertManagementService()
