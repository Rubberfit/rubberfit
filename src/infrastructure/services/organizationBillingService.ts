import type { SupabaseClient } from "@supabase/supabase-js"

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
  cancel_at_period_end: boolean | null
  cancel_at: string | null
  current_period_end: string | null
  is_current: boolean | null
}

interface OrganizationGateRow {
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

function currentSubscription(row: OrganizationGateRow): CurrentSubscriptionRow | null {
  const joined = row.current_subscription
  if (!joined) return null
  if (!Array.isArray(joined)) {
    return joined.is_current === false ? null : joined
  }
  return joined.find((subscription) => subscription.is_current !== false) ?? null
}

export async function getSubscriptionGateForUser(
  client: SupabaseClient,
  userId: string
): Promise<SubscriptionGateResult> {
  const { data, error } = await client
    .from("organizations")
    .select(
      `
        id,
        member:organization_members!inner(
          user_id,
          status
        ),
        current_subscription:organization_subscriptions(
          id,
          stripe_subscription_id,
          status,
          cancel_at_period_end,
          cancel_at,
          current_period_end,
          is_current
        )
      `
    )
    .eq("member.user_id", userId)
    .eq("member.status", "active")
    .eq("current_subscription.is_current", true)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return { kind: "needs_workspace" }

  const organization = data as OrganizationGateRow
  const subscription = currentSubscription(organization)
  if (!subscription) {
    return {
      kind: "blocked",
      organizationId: organization.id,
      status: "missing",
      recovery: "complete_checkout",
    }
  }

  if (!isBillingStatus(subscription.status)) {
    throw new Error(`Unexpected billing status: ${String(subscription.status)}`)
  }

  const status = subscription.status
  if (status === "trialing" || status === "active") {
    return {
      kind: "allowed",
      organizationId: organization.id,
      subscriptionId: subscription.stripe_subscription_id ?? subscription.id,
      status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      cancelAt: subscription.cancel_at,
      currentPeriodEnd: subscription.current_period_end,
    }
  }

  return {
    kind: "blocked",
    organizationId: organization.id,
    status,
    recovery: deriveRecoveryIntent(status),
  }
}

export async function getSubscriptionGateForActor(
  actor: ActionActor
): Promise<SubscriptionGateResult> {
  const client = await getDatabaseClient()
  return getSubscriptionGateForUser(client, actor.id)
}
