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
 * Per-payment audit page.
 *
 * Data flow: `listBillingHistory` action live-fetches invoices from
 * Stripe for the org's customer and joins them with the local
 * `organization_subscriptions` rows so each invoice carries plan
 * tier + billing interval context. The action falls back to a
 * subscription-only view when Stripe is unreachable or the org has
 * no customer id yet (legacy / grandfather migration), so the page
 * always renders something useful.
 *
 * Server component — keeps the Stripe SDK off the client bundle.
 * Cost per render is one `stripe.invoices.list` call; the audit
 * page is visited rarely enough that this is cheaper than syncing
 * an `invoices` table locally.
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

function toTableRow(row: BillingHistoryActionRow): BillingHistoryRow {
  return {
    id: row.id,
    date: format(new Date(row.createdAt), "yyyy-MM-dd"),
    plan: row.planTier.toUpperCase() as BillingHistoryRow["plan"],
    // `billing_interval` is nullable on legacy rows. Map explicitly
    // so the table doesn't silently mis-label them; null flows
    // through to the table where it renders as `—`.
    interval:
      row.billingInterval === "annual"
        ? "ANNUAL"
        : row.billingInterval === "monthly"
          ? "MONTHLY"
          : null,
    seats: row.seatCount,
    periodStart: row.periodStart ? format(new Date(row.periodStart), "yyyy-MM-dd") : null,
    periodEnd: row.periodEnd ? format(new Date(row.periodEnd), "yyyy-MM-dd") : null,
    amountCents: row.amountCents,
    status: row.status,
    invoiceUrl: row.invoiceUrl,
  }
}
