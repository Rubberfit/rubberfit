import type Stripe from "stripe"

import { getStripeClient } from "@/src/infrastructure/stripe/client"

export interface StripeInvoiceSummary {
  id: string
  // Stripe's `created` is a unix-seconds epoch — converted to ISO-8601 here
  // so the action layer doesn't have to know the source format.
  createdAt: string
  /** Amount actually paid for this invoice, in the smallest currency unit. */
  amountPaid: number
  currency: string
  status: "draft" | "open" | "paid" | "uncollectible" | "void" | null
  /** Stripe's hosted invoice page (no auth required to view). */
  hostedInvoiceUrl: string | null
  /** Direct PDF download URL. */
  invoicePdfUrl: string | null
  /** The subscription this invoice billed against, or null for one-offs. */
  subscriptionId: string | null
  /** Period covered by the invoice (also unix-seconds → ISO). */
  periodStart: string | null
  periodEnd: string | null
}

/**
 * Live fetch of invoices from Stripe for a single customer. Used by
 * the per-payment audit page (`/dashboard/settings/billing/history`).
 *
 * We choose live fetch over caching the data locally because:
 *   - Audit pages are visited rarely; one Stripe call per visit is
 *     cheaper than maintaining a synced `invoices` table.
 *   - Stripe is the merchant of record — the latest amounts (after
 *     refunds, adjustments, disputes) are always correct here.
 *   - Stripe ratelimits aren't a concern at this traffic shape.
 *
 * If/when traffic scales or we need offline access to the audit,
 * the natural follow-up is to extend the webhook handler to persist
 * `invoice.*` events into a local `invoices` table.
 */
export async function listStripeInvoicesForCustomer(
  stripeCustomerId: string,
  limit: number = 100
): Promise<StripeInvoiceSummary[]> {
  if (!stripeCustomerId) return []
  const client = getStripeClient()
  const result = await client.invoices.list({
    customer: stripeCustomerId,
    limit,
  })
  return result.data.map(toSummary)
}

function toSummary(invoice: Stripe.Invoice): StripeInvoiceSummary {
  // `invoice.subscription` is `string | Stripe.Subscription | null` —
  // we only need the id; the expanded form would be a wasted byte.
  const subscriptionField = (
    invoice as unknown as { subscription?: string | { id: string } | null }
  ).subscription
  const subscriptionId =
    typeof subscriptionField === "string"
      ? subscriptionField
      : subscriptionField && typeof subscriptionField === "object"
        ? subscriptionField.id
        : null

  return {
    id: invoice.id ?? "",
    createdAt: new Date(invoice.created * 1000).toISOString(),
    amountPaid: invoice.amount_paid ?? 0,
    currency: invoice.currency ?? "usd",
    status: invoice.status,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdfUrl: invoice.invoice_pdf ?? null,
    subscriptionId,
    periodStart: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
    periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
  }
}
