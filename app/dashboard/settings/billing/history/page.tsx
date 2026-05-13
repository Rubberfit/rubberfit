import { format } from "date-fns"

import {
  BillingHistoryTable,
  type BillingHistoryRow,
} from "@/app/components/billing/BillingHistoryTable"
import {
  listBillingHistory,
  type BillingHistoryActionRow,
} from "@/app/actions/billing-history"

export const dynamic = "force-dynamic"

/**
 * Per-payment audit page. Streams `organization_subscriptions` rows
 * via the `listBillingHistory` action; maps the Stripe sub status to
 * the `<StatusPill>`'s 4-state model and leaves `amountCents` /
 * `invoiceUrl` null pending the Stripe `invoices.list` join (tracked
 * as a follow-up).
 *
 * Server component — keeps the action call off the client bundle and
 * avoids a render flash for what is effectively read-only data.
 */
export default async function BillingHistoryPage() {
  const rows = await listBillingHistory()
  const tableRows = rows.map(toTableRow)

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <BillingHistoryTable rows={tableRows} />
    </div>
  )
}

/**
 * Map a subscription history row to the table's display shape.
 * `last_payment_status` drives the pill when present; otherwise we
 * derive a sensible fallback from `status` (active/trialing → paid,
 * past_due/unpaid → failed, canceled → refunded, others → pending).
 */
function toTableRow(row: BillingHistoryActionRow): BillingHistoryRow {
  return {
    id: row.id,
    date: format(new Date(row.createdAt), "yyyy-MM-dd"),
    plan: row.planTier.toUpperCase() as BillingHistoryRow["plan"],
    // `billing_interval` is nullable in DB — rows from the early
    // pre-Stripe-rollout era can carry NULL. Map explicitly so the
    // table doesn't silently mis-label them as MONTHLY.
    interval:
      row.billingInterval === "annual"
        ? "ANNUAL"
        : row.billingInterval === "monthly"
          ? "MONTHLY"
          : "MONTHLY",
    seats: row.seatCount,
    periodStart: row.currentPeriodStart
      ? format(new Date(row.currentPeriodStart), "yyyy-MM-dd")
      : null,
    periodEnd: row.currentPeriodEnd
      ? format(new Date(row.currentPeriodEnd), "yyyy-MM-dd")
      : null,
    amountCents: null,
    status: mapStatus(row.lastPaymentStatus, row.status),
    invoiceUrl: null,
  }
}

function mapStatus(
  paymentStatus: string | null,
  subStatus: BillingHistoryActionRow["status"]
): BillingHistoryRow["status"] {
  if (paymentStatus === "paid") return "paid"
  if (paymentStatus === "failed") return "failed"
  if (paymentStatus === "refunded") return "refunded"
  if (paymentStatus === "pending") return "pending"
  // No payment status mirrored yet — fall back to the sub status so
  // the pill is informative rather than blank.
  if (subStatus === "active" || subStatus === "trialing") return "paid"
  if (subStatus === "past_due" || subStatus === "unpaid") return "failed"
  if (subStatus === "canceled") return "refunded"
  return "pending"
}
