"use server"

import { type PlanTier } from "@/src/application/billing/feature-tiers"
import { organizationService } from "@/src/infrastructure/services/organizationService"
import { listSubscriptionHistoryForOrg } from "@/src/infrastructure/services/organizationBillingService"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

export interface BillingSummaryData {
  tier: PlanTier
  status: "active" | "trialing"
  currentPeriodEnd: string | null
  billingInterval: "monthly" | "annual" | null
  seatCount: number
  organizationId: string
  organizationName: string
}

/**
 * Loads the everything the `/dashboard/settings/billing` landing
 * page needs in a single round-trip: the active sub (tier + status
 * + period + interval), the org's display name, and the current
 * member seat count.
 *
 * Authenticated + active-sub-gated. The proxy already routes
 * lapsed/blocked customers through the recovery flow, so by the
 * time this loads we have an `allowed` gate.
 */
export async function getBillingSummary(): Promise<BillingSummaryData> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const gate = await requireActiveSubscription(actor)

  const db = await getDatabaseClient()
  const [org, history, seatCount] = await Promise.all([
    gate.organizationId
      ? organizationService.getOrganizationById(gate.organizationId)
      : Promise.resolve(null),
    gate.organizationId
      ? listSubscriptionHistoryForOrg(db, gate.organizationId)
      : Promise.resolve([]),
    gate.organizationId
      ? organizationService.countActiveMembers(gate.organizationId).catch(() => 1)
      : Promise.resolve(1),
  ])

  const current = history.find((row) => row.status === gate.status) ?? history[0] ?? null
  const billingInterval =
    current?.billing_interval === "annual"
      ? "annual"
      : current?.billing_interval === "monthly"
        ? "monthly"
        : null

  return {
    tier: gate.planTier,
    status: gate.status,
    currentPeriodEnd: gate.currentPeriodEnd,
    billingInterval,
    // Floor at 1 — every org has at least the owner, even if the
    // count query gave a transient 0.
    seatCount: Math.max(1, seatCount),
    organizationId: gate.organizationId,
    organizationName: org?.name?.trim() || "Your organization",
  }
}
