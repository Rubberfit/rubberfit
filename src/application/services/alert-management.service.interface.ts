import type { SupabaseClient } from "@supabase/supabase-js"

export type AlertSeverity = "low" | "medium" | "high" | "critical"
export type AlertStatus = "active" | "investigating" | "resolved"
export type AlertAction = "acknowledge" | "resolve"

export interface AlertRow {
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

export type AlertUpdateResult = { ok: true; alert: AlertRow } | { ok: false; error: string }

export interface IAlertManagementService {
  /**
   * Returns alerts in `active` or `investigating` status, ordered by
   * `triggered_at` descending (most recent first).
   */
  listOpenAlerts(client: SupabaseClient): Promise<AlertRow[]>

  /**
   * Acknowledge or resolve an alert and write the corresponding
   * `admin.admin_activity_log` row.
   */
  applyAlertAction(
    client: SupabaseClient,
    params: {
      alertId: string
      action: AlertAction
      actorUserId: string
      actorEmail: string | null
    }
  ): Promise<AlertUpdateResult>
}
