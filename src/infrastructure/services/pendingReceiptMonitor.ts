import type { SupabaseClient } from "@supabase/supabase-js"

import { APP_CONFIG } from "@/config/app-config"

/**
 * Step 7c-2 follow-up: scans the safety-net views and alerts admins
 * when PO receipts have been stuck in either reconciliation queue for
 * longer than the threshold.
 *
 * Architectural note: this is INFRASTRUCTURE-level and NOT a use-case,
 * which the DDD rules in CLAUDE.md would otherwise prefer for "fires a
 * side effect" work. The reason: this runs from a Vercel cron context
 * with no cookie-bound session, so every read+write must thread an
 * admin client explicitly. The standard DDD use-case shape resolves
 * services via DI and those services resolve their client via
 * `getDatabaseClient()` — which expects request cookies and fails in
 * cron. Until admin-client orchestration is abstracted across the
 * service surface (a non-trivial cross-cutting refactor), this stays
 * inline. Tests cover the function directly via a fake client.
 *
 * The dedup mechanism is deliberately count-agnostic: the title is a
 * fixed string and the changing count lives in the description, so the
 * existence check stays robust when the safety-net populates one
 * receipt at a time across consecutive ticks.
 */
export interface PendingReceiptMonitorResult {
  pendingApplyCount: number
  pendingRollCount: number
  notificationsCreated: number
  notificationsSkippedDedup: number
  tenantsScanned: number
}

const ALERT_TITLE = "PO receipts pending reconciliation"
const RECONCILE_PATH = "/dashboard/admin/inventory/po-reconciliation"

interface PendingApplyRow {
  receipt_id: string
  tenant_id: string
  receipt_created_at: string | null
}

interface PendingRollRow {
  receipt_id: string
  tenant_id: string
  applied_at: string | null
}

interface AdminMembershipRow {
  profile_id: string
}

export async function monitorPendingReceipts(
  adminClient: SupabaseClient,
  now: Date = new Date()
): Promise<PendingReceiptMonitorResult> {
  const thresholdMs = APP_CONFIG.PO_RECEIPT_PENDING_ALERT_THRESHOLD_HOURS * 60 * 60 * 1000
  const dedupMs = APP_CONFIG.PO_RECEIPT_PENDING_ALERT_DEDUP_WINDOW_HOURS * 60 * 60 * 1000
  const thresholdCutoff = new Date(now.getTime() - thresholdMs).toISOString()
  const dedupCutoff = new Date(now.getTime() - dedupMs).toISOString()

  const [applyRes, rollRes] = await Promise.all([
    adminClient
      .from("po_receipts_pending_apply")
      .select("receipt_id, tenant_id, receipt_created_at"),
    adminClient
      .from("po_receipts_pending_roll_creation")
      .select("receipt_id, tenant_id, applied_at"),
  ])

  if (applyRes.error) throw applyRes.error
  if (rollRes.error) throw rollRes.error

  const overdueApply = ((applyRes.data ?? []) as PendingApplyRow[]).filter(
    (r) => r.receipt_created_at !== null && r.receipt_created_at < thresholdCutoff
  )
  const overdueRoll = ((rollRes.data ?? []) as PendingRollRow[]).filter(
    (r) => r.applied_at !== null && r.applied_at < thresholdCutoff
  )

  const result: PendingReceiptMonitorResult = {
    pendingApplyCount: overdueApply.length,
    pendingRollCount: overdueRoll.length,
    notificationsCreated: 0,
    notificationsSkippedDedup: 0,
    tenantsScanned: 0,
  }

  if (overdueApply.length === 0 && overdueRoll.length === 0) {
    return result
  }

  const tenantIds = new Set<string>()
  for (const r of overdueApply) tenantIds.add(r.tenant_id)
  for (const r of overdueRoll) tenantIds.add(r.tenant_id)
  result.tenantsScanned = tenantIds.size

  for (const tenantId of tenantIds) {
    const tenantApplyCount = overdueApply.filter((r) => r.tenant_id === tenantId).length
    const tenantRollCount = overdueRoll.filter((r) => r.tenant_id === tenantId).length

    const adminsRes = await adminClient
      .from("memberships")
      .select("profile_id")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .contains("roles", ["admin"])

    if (adminsRes.error) {
      console.error(
        `[pending-receipt-monitor] admin lookup failed for tenant ${tenantId}:`,
        adminsRes.error
      )
      continue
    }

    const admins = (adminsRes.data ?? []) as AdminMembershipRow[]
    if (admins.length === 0) continue

    const description =
      `${tenantApplyCount} receipt(s) pending apply, ${tenantRollCount} pending roll creation. ` +
      `Visit ${RECONCILE_PATH} to retry.`

    for (const admin of admins) {
      const existingRes = await adminClient
        .from("notifications")
        .select("id")
        .eq("user_id", admin.profile_id)
        .eq("type", "system_alert")
        .eq("title", ALERT_TITLE)
        .gte("created_at", dedupCutoff)
        .limit(1)

      if (existingRes.error) {
        console.error(
          `[pending-receipt-monitor] dedup lookup failed for user ${admin.profile_id}:`,
          existingRes.error
        )
        continue
      }

      if ((existingRes.data ?? []).length > 0) {
        result.notificationsSkippedDedup += 1
        continue
      }

      const inAppRes = await adminClient.from("notifications").insert({
        tenant_id: tenantId,
        user_id: admin.profile_id,
        type: "system_alert",
        title: ALERT_TITLE,
        description,
        is_read: false,
      })

      if (inAppRes.error) {
        console.error(
          `[pending-receipt-monitor] in-app insert failed for user ${admin.profile_id}:`,
          inAppRes.error
        )
        continue
      }

      // Email queue is best-effort — an in-app row already landed, so a
      // queue failure shouldn't void the whole alert. Log and continue.
      const queueRes = await adminClient.from("notification_queue").insert({
        tenant_id: tenantId,
        user_id: admin.profile_id,
        notification_type: "critical_alert",
        title: ALERT_TITLE,
        message: description,
        send_email: true,
        send_sms: false,
        priority: "high",
        scheduled_for: now.toISOString(),
        status: "pending",
        retry_count: 0,
        max_retries: 3,
      })

      if (queueRes.error) {
        console.error(
          `[pending-receipt-monitor] queue insert failed for user ${admin.profile_id}:`,
          queueRes.error
        )
      }

      result.notificationsCreated += 1
    }
  }

  return result
}
