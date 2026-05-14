import {
  BillingHistoryTable,
  type BillingHistoryRow,
} from "@/app/components/billing/BillingHistoryTable"
import { listBillingHistory, type BillingHistoryActionRow } from "@/app/actions/billing-history"
import { getUserPreferences } from "@/app/actions/user-preferences"
import { formatUserDate } from "@/src/application/preferences/user-date-format"
import {
  buildFallbackUserPreferences,
  type UserPreferences,
} from "@/src/infrastructure/models/user-preferences"

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
  // Fetch the operator's date format alongside the invoice rows so
  // every date column on the table renders the way they picked it
  // on /dashboard/settings/general. The not_provisioned branch keeps
  // the page renderable for users whose trigger row hasn't landed.
  const [rows, prefsResult] = await Promise.all([listBillingHistory(), getUserPreferences()])
  const preferences: UserPreferences =
    "data" in prefsResult ? prefsResult.data : buildFallbackUserPreferences()
  const tableRows = rows.map((row) => toTableRow(row, preferences))

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <BillingHistoryTable rows={tableRows} />
    </div>
  )
}

function toTableRow(row: BillingHistoryActionRow, preferences: UserPreferences): BillingHistoryRow {
  return {
    id: row.id,
    date: formatUserDate(row.createdAt, preferences),
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
    periodStart: row.periodStart ? formatUserDate(row.periodStart, preferences) : null,
    periodEnd: row.periodEnd ? formatUserDate(row.periodEnd, preferences) : null,
    amountCents: row.amountCents,
    status: row.status,
    invoiceUrl: row.invoiceUrl,
  }
}
