import type { SupabaseClient } from "@supabase/supabase-js"

import { isPlanTier, type PlanTier } from "@/src/application/billing/feature-tiers"
import type {
  BillingStatus,
  SubscriptionGateResult,
} from "@/src/application/billing/subscription-gate"
import { deriveRecoveryIntent } from "@/src/application/billing/subscription-gate"
import type { ActionActor } from "@/src/application/types/action-actor"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

interface CurrentSubscriptionRow {
  id: string
  stripe_subscription_id: string | null
  status: BillingStatus
  plan_tier: PlanTier
  cancel_at_period_end: boolean | null
  cancel_at: string | null
  current_period_end: string | null
  is_current: boolean | null
}

interface TenantGateRow {
  id: string
  current_subscription: CurrentSubscriptionRow | CurrentSubscriptionRow[] | null
}

const BILLING_STATUSES: readonly BillingStatus[] = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]

function isBillingStatus(value: unknown): value is BillingStatus {
  return typeof value === "string" && BILLING_STATUSES.includes(value as BillingStatus)
}

function currentSubscription(row: TenantGateRow): CurrentSubscriptionRow | null {
  const joined = row.current_subscription
  if (!joined) return null
  if (!Array.isArray(joined)) {
    return joined.is_current === false ? null : joined
  }
  return joined.find((subscription) => subscription.is_current !== false) ?? null
}

const GATE_SELECT = `
        id,
        membership:memberships!inner(
          profile_id,
          deleted_at
        ),
        current_subscription:subscriptions(
          id,
          stripe_subscription_id,
          status,
          plan_tier,
          cancel_at_period_end,
          cancel_at,
          current_period_end,
          is_current
        )
      `

function resolveGate(row: TenantGateRow | null): SubscriptionGateResult {
  if (!row) return { kind: "needs_workspace" }

  const subscription = currentSubscription(row)
  if (!subscription) {
    return {
      kind: "blocked",
      organizationId: row.id,
      status: "missing",
      recovery: "complete_checkout",
    }
  }

  if (!isBillingStatus(subscription.status)) {
    throw new Error(`Unexpected billing status: ${String(subscription.status)}`)
  }
  if (!isPlanTier(subscription.plan_tier)) {
    throw new Error(`Unexpected plan tier: ${String(subscription.plan_tier)}`)
  }

  const status = subscription.status
  if (status === "trialing" || status === "active") {
    return {
      kind: "allowed",
      organizationId: row.id,
      subscriptionId: subscription.stripe_subscription_id ?? subscription.id,
      status,
      planTier: subscription.plan_tier,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      cancelAt: subscription.cancel_at,
      currentPeriodEnd: subscription.current_period_end,
    }
  }

  return {
    kind: "blocked",
    organizationId: row.id,
    status,
    recovery: deriveRecoveryIntent(status),
  }
}

export async function getSubscriptionGateForUser(
  client: SupabaseClient,
  userId: string
): Promise<SubscriptionGateResult> {
  const { data, error } = await client
    .from("tenants")
    .select(GATE_SELECT)
    .eq("membership.profile_id", userId)
    .is("membership.deleted_at", null)
    .eq("current_subscription.is_current", true)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return resolveGate(data as TenantGateRow | null)
}

async function getSubscriptionGateForTenant(
  client: SupabaseClient,
  tenantId: string,
  profileId: string
): Promise<SubscriptionGateResult> {
  const { data, error } = await client
    .from("tenants")
    .select(GATE_SELECT)
    .eq("id", tenantId)
    .eq("membership.profile_id", profileId)
    .is("membership.deleted_at", null)
    .eq("current_subscription.is_current", true)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return resolveGate(data as TenantGateRow | null)
}

export async function getSubscriptionGateForActor(
  actor: ActionActor
): Promise<SubscriptionGateResult> {
  const client = await getDatabaseClient()
  if (actor.activeTenantId !== null) {
    return getSubscriptionGateForTenant(client, actor.activeTenantId, actor.id)
  }
  return getSubscriptionGateForUser(client, actor.id)
}

export interface SubscriptionHistoryRow {
  id: string
  created_at: string
  plan_tier: string
  billing_interval: string | null
  seat_count: number
  current_period_start: string | null
  current_period_end: string | null
  status: string
  last_payment_status: string | null
  stripe_subscription_id: string | null
}

/**
 * Per-payment audit feed: every `subscriptions` row for the tenant,
 * newest first. Includes superseded (`is_current=false`) rows so the
 * billing-history page surfaces the full lifecycle.
 */
export async function listSubscriptionHistoryForOrg(
  client: SupabaseClient,
  organizationId: string
): Promise<SubscriptionHistoryRow[]> {
  const { data, error } = await client
    .from("subscriptions")
    .select(
      "id, created_at, plan_tier, billing_interval, seat_count, current_period_start, current_period_end, status, last_payment_status, stripe_subscription_id"
    )
    .eq("tenant_id", organizationId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to load billing history: ${error.message}`)
  }
  return (data ?? []) as SubscriptionHistoryRow[]
}
