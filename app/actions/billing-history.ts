"use server"

import { isPlanTier, type PlanTier } from "@/src/application/billing/feature-tiers"
import { listSubscriptionHistoryForOrg } from "@/src/infrastructure/services/organizationBillingService"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

export interface BillingHistoryActionRow {
  id: string
  /** ISO-8601 timestamp of when the subscription row was created. */
  createdAt: string
  planTier: PlanTier
  billingInterval: "monthly" | "annual" | null
  seatCount: number
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  status:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "paused"
  lastPaymentStatus: string | null
  stripeSubscriptionId: string | null
}

/**
 * Per-payment audit feed for the org's billing history page. Pulls
 * every `organization_subscriptions` row owned by the actor's org —
 * including superseded (`is_current=false`) rows — newest first, so
 * the table reflects the full historical lifecycle of plan changes.
 *
 * RLS scopes by `organization_id`; the proxy gate ensures the actor
 * is an active member before this action is invoked.
 *
 * Amount + invoice URL fields are intentionally not joined here yet
 * — they live in Stripe (no local `invoices` table). The page maps
 * each row to a `BillingHistoryRow` with `amountCents: null` so the
 * table renders the `—` placeholder. Adding the Stripe `invoices.list`
 * join is tracked as a follow-up after the rest of the tier-gating
 * phase ships.
 */
export async function listBillingHistory(): Promise<BillingHistoryActionRow[]> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const gate = await requireActiveSubscription(actor)
  if (!gate.organizationId) return []

  const db = await getDatabaseClient()
  const rows = await listSubscriptionHistoryForOrg(db, gate.organizationId)

  return rows.flatMap((row) => {
    if (!isPlanTier(row.plan_tier)) return []
    if (!isKnownStatus(row.status)) return []
    const billingInterval = isKnownInterval(row.billing_interval) ? row.billing_interval : null
    return [
      {
        id: row.id,
        createdAt: row.created_at,
        planTier: row.plan_tier,
        billingInterval,
        seatCount: row.seat_count,
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        status: row.status,
        lastPaymentStatus: row.last_payment_status,
        stripeSubscriptionId: row.stripe_subscription_id,
      },
    ]
  })
}

function isKnownStatus(s: string): s is BillingHistoryActionRow["status"] {
  return (
    s === "incomplete" ||
    s === "incomplete_expired" ||
    s === "trialing" ||
    s === "active" ||
    s === "past_due" ||
    s === "canceled" ||
    s === "unpaid" ||
    s === "paused"
  )
}

function isKnownInterval(s: string | null): s is "monthly" | "annual" {
  return s === "monthly" || s === "annual"
}
