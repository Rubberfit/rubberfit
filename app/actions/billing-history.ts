"use server"

import { isPlanTier, type PlanTier } from "@/src/application/billing/feature-tiers"
import { organizationService } from "@/src/infrastructure/services/organizationService"
import {
  listSubscriptionHistoryForOrg,
  type SubscriptionHistoryRow,
} from "@/src/infrastructure/services/organizationBillingService"
import {
  listStripeInvoicesForCustomer,
  type StripeInvoiceSummary,
} from "@/src/infrastructure/services/stripeInvoicesService"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

export interface BillingHistoryActionRow {
  id: string
  /** ISO-8601 timestamp of the invoice creation (or sub row created_at fallback). */
  createdAt: string
  planTier: PlanTier
  billingInterval: "monthly" | "annual" | null
  seatCount: number | null
  periodStart: string | null
  periodEnd: string | null
  amountCents: number | null
  /**
   * UI-friendly status — narrowed to the 4-state model the
   * StatusPill renders. Driven by `invoice.status` when present,
   * with a fallback derived from the subscription row.
   */
  status: "paid" | "failed" | "refunded" | "pending"
  /**
   * Stripe's hosted invoice page if available — opens to a public
   * invoice view with download links. Customers click this rather
   * than fetching a PDF the dashboard would have to proxy.
   */
  invoiceUrl: string | null
}

/**
 * Per-payment audit feed. Live-fetches invoices from Stripe and
 * joins them with the org's `organization_subscriptions` rows so
 * each invoice row carries plan tier + billing interval context.
 *
 * Falls back gracefully:
 *   - Stripe unreachable → returns subscription-row history only
 *     (no amounts, no invoice URLs).
 *   - No `stripe_customer_id` on the org (legacy / grandfather
 *     migration) → ditto.
 *
 * Idempotent + side-effect-free; the audit page calls this on
 * every render (which is fine — the page is rate-limited by the
 * proxy auth gate, not by content cost).
 */
export async function listBillingHistory(): Promise<BillingHistoryActionRow[]> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const gate = await requireActiveSubscription(actor)
  if (!gate.organizationId) return []

  const db = await getDatabaseClient()
  const [org, subRows] = await Promise.all([
    organizationService.getOrganizationById(gate.organizationId),
    listSubscriptionHistoryForOrg(db, gate.organizationId),
  ])

  const invoices = await fetchInvoicesQuietly(org?.stripe_customer_id)

  if (invoices.length > 0) {
    return buildInvoiceRows(invoices, subRows)
  }
  // No Stripe data — render the local subscription-row history as
  // the fallback so the page still shows something useful when
  // Stripe is down or the org has no customer id yet.
  return buildSubscriptionRows(subRows)
}

async function fetchInvoicesQuietly(
  stripeCustomerId: string | null | undefined
): Promise<StripeInvoiceSummary[]> {
  if (!stripeCustomerId) return []
  try {
    return await listStripeInvoicesForCustomer(stripeCustomerId)
  } catch (err) {
    // Stripe rate-limit / network / config error must not break the
    // audit page — log + return empty so the local fallback runs.
    console.error("[billing-history] Stripe invoices fetch failed:", err)
    return []
  }
}

function buildInvoiceRows(
  invoices: readonly StripeInvoiceSummary[],
  subRows: readonly SubscriptionHistoryRow[]
): BillingHistoryActionRow[] {
  const subByStripeId = new Map<string, SubscriptionHistoryRow>()
  for (const sub of subRows) {
    if (sub.stripe_subscription_id) {
      subByStripeId.set(sub.stripe_subscription_id, sub)
    }
  }

  // Stripe returns invoices newest-first already, but defend against
  // the order ever shifting — explicit sort keeps the audit row
  // ordering deterministic.
  const sorted = [...invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return sorted.flatMap((inv) => {
    const sub = inv.subscriptionId ? subByStripeId.get(inv.subscriptionId) ?? null : null
    const planTier = sub && isPlanTier(sub.plan_tier) ? sub.plan_tier : null
    if (!planTier) {
      // Can't classify a tier — skip rather than render an
      // ambiguous row. Edge case: one-off invoices or invoices for
      // a subscription the local table doesn't have.
      return []
    }
    const billingInterval: BillingHistoryActionRow["billingInterval"] =
      sub?.billing_interval === "annual"
        ? "annual"
        : sub?.billing_interval === "monthly"
          ? "monthly"
          : null
    return [
      {
        id: inv.id,
        createdAt: inv.createdAt,
        planTier,
        billingInterval,
        seatCount: sub?.seat_count ?? null,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        amountCents: inv.amountPaid,
        status: mapInvoiceStatus(inv.status),
        invoiceUrl: inv.hostedInvoiceUrl,
      },
    ]
  })
}

function buildSubscriptionRows(
  subRows: readonly SubscriptionHistoryRow[]
): BillingHistoryActionRow[] {
  return subRows.flatMap((row) => {
    if (!isPlanTier(row.plan_tier)) return []
    const billingInterval: BillingHistoryActionRow["billingInterval"] =
      row.billing_interval === "annual"
        ? "annual"
        : row.billing_interval === "monthly"
          ? "monthly"
          : null
    return [
      {
        id: row.id,
        createdAt: row.created_at,
        planTier: row.plan_tier,
        billingInterval,
        seatCount: row.seat_count,
        periodStart: row.current_period_start,
        periodEnd: row.current_period_end,
        amountCents: null,
        status: mapSubFallbackStatus(row.status, row.last_payment_status),
        invoiceUrl: null,
      },
    ]
  })
}

/**
 * Stripe invoice statuses map to the 4-state UI pill.
 *
 *   - paid → paid
 *   - uncollectible → failed (Stripe gave up collecting)
 *   - draft / open / void → pending (no money changed hands)
 *
 * `void` is critical: a voided invoice was canceled BEFORE payment
 * was collected, so no refund occurred. Mapping it to `refunded`
 * would mislead customers reviewing the audit into thinking money
 * was returned. The 4-state model has no `canceled` slot, so
 * `pending` is the least-wrong unresolved bucket.
 *
 * Real refunds — when money WAS collected and then returned — come
 * through Stripe Refund objects, not invoice status, and would
 * surface as `refunded` once we wire the refund-events fetch.
 * Tracked separately.
 */
function mapInvoiceStatus(
  status: StripeInvoiceSummary["status"]
): BillingHistoryActionRow["status"] {
  if (status === "paid") return "paid"
  if (status === "uncollectible") return "failed"
  // draft / open / void / null all surface as pending (no money
  // changed hands, no refund occurred).
  return "pending"
}

function mapSubFallbackStatus(
  subStatus: string,
  paymentStatus: string | null
): BillingHistoryActionRow["status"] {
  if (paymentStatus === "paid") return "paid"
  if (paymentStatus === "failed") return "failed"
  if (paymentStatus === "refunded") return "refunded"
  if (paymentStatus === "pending") return "pending"
  if (subStatus === "active" || subStatus === "trialing") return "paid"
  if (subStatus === "past_due" || subStatus === "unpaid") return "failed"
  return "pending"
}

