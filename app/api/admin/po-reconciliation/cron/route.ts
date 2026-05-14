import { NextRequest, NextResponse } from "next/server"

import { makeAdminClient } from "@/src/infrastructure/supabase/server-clients"
import { monitorPendingReceipts } from "@/src/infrastructure/services/pendingReceiptMonitor"

/**
 * POST /api/admin/po-reconciliation/cron
 *
 * Hourly Vercel cron that scans the 7c-1 safety-net views
 * (po_receipts_pending_apply, po_receipts_pending_roll_creation) and
 * pages admins when receipts have been stuck for >THRESHOLD_HOURS.
 *
 * Authenticated via Authorization: Bearer <CRON_SECRET>, mirroring
 * /api/admin/health/cron. Uses the admin (service-role) client because
 * cron has no cookie-bound session.
 */
export async function POST(request: NextRequest) {
  const start = Date.now()

  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const adminClient = makeAdminClient()
  if (!adminClient) {
    return NextResponse.json({ error: "Service role key not configured" }, { status: 500 })
  }

  try {
    const result = await monitorPendingReceipts(adminClient)
    return NextResponse.json({ ...result, durationMs: Date.now() - start })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
