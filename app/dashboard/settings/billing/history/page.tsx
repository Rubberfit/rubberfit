import {
  BillingHistoryTable,
  type BillingHistoryRow,
} from "@/app/components/billing/BillingHistoryTable"
import { listBillingHistory, type BillingHistoryActionRow } from "@/app/actions/billing-history"
import { getOrganizationPreferences } from "@/app/actions/organization-preferences"
import { formatUserDate } from "@/src/application/preferences/user-date-format"
import {
  buildFallbackOrganizationPreferences,
  type OrganizationPreferences,
} from "@/src/infrastructure/models/organization-preferences"

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
  // Fetch the workspace's date format alongside the invoice rows so
  // every date column on the audit table renders in the operator's
  // canonical voice — billing history is a printed/shared artifact
  // (operator-seeds-prints ruling 2026-05-14), so it shouldn't
  // shape-shift based on which user happens to view it. The
  // not_provisioned / no_organization branches keep the page
  // renderable when the provision trigger hasn't landed.
  const [rows, prefsResult] = await Promise.all([
    listBillingHistory(),
    getOrganizationPreferences(),
  ])
  const preferences: OrganizationPreferences =
    "data" in prefsResult ? prefsResult.data : buildFallbackOrganizationPreferences()
  const tableRows = rows.map((row) => toTableRow(row, preferences))

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <BillingHistoryTable rows={tableRows} />
    </div>
  )
}

function toTableRow(
  row: BillingHistoryActionRow,
  preferences: OrganizationPreferences
): BillingHistoryRow {
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
    // The helper returns "" for null/undefined and shape-valid invalid
    // dates; coerce empties to null so the table's existing null →
    // "—" rendering kicks in consistently.
    periodStart: formatUserDate(row.periodStart, preferences) || null,
    periodEnd: formatUserDate(row.periodEnd, preferences) || null,
    amountCents: row.amountCents,
    status: row.status,
    invoiceUrl: row.invoiceUrl,
  }
}
