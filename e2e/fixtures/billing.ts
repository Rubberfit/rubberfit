/**
 * E2E billing fixture — attaches a current subscription to the test user's
 * tenant so subscription-gated routes (`requireActiveSubscription`,
 * `requireFeature`) see a healthy plan row.
 *
 * Rewritten for the DDD schema (PR #283): the org boundary is `tenants` (not
 * the old `organizations`), membership is on `memberships`, and subscriptions
 * live on `subscriptions` with a NOT NULL FK to `plans`. `auth.ts` already
 * creates a fresh tenant per test user, so this fixture only adds the
 * subscription row — it does not create a separate org.
 *
 * Export names (`provisionOrgAtTier`, `deleteTestOrganization`,
 * `TestOrganization`) are preserved so spec call sites compile unchanged. The
 * returned `id` is the user's tenant_id — passing it to
 * `deleteTestOrganization` cascades the tenant away, removing memberships and
 * subscriptions along with it.
 *
 * Prereq: `public.plans` must have rows for the requested tier code
 * (`standard`, `pro`, `max`). Seeded by `supabase/seed.sql`.
 */
import { randomUUID } from "node:crypto"

import { adminClient, type TestUser } from "./auth"

import type { PlanTier } from "@/src/application/billing/feature-tiers"

export interface TestOrganization {
  id: string
  name: string
}

export interface ProvisionTierOptions {
  tier: PlanTier
  /**
   * Defaults to `"active"` (the typical paying-customer state).
   * Use `"trialing"` to exercise the trial-window branch of
   * `getEffectiveTier` (Standard → Pro during trial).
   */
  status?: "active" | "trialing"
  /**
   * Subscriptions track billing cadence with `"monthly"` / `"annual"`
   * (suffix form). Note that `plans.billing_interval` uses singular
   * `"month"` / `"year"` — different vocabularies on the two tables.
   */
  billingInterval?: "monthly" | "annual"
  organizationName?: string
}

/**
 * Provision a current subscription row at the requested tier for the test
 * user's tenant. Returns the tenant id wrapped in a `TestOrganization` shape
 * so the spec's existing teardown call (`deleteTestOrganization(org.id)`)
 * keeps working.
 */
export async function provisionOrgAtTier(
  user: TestUser,
  opts: ProvisionTierOptions
): Promise<TestOrganization> {
  const status = opts.status ?? "active"
  const billingInterval = opts.billingInterval ?? "monthly"

  const { data: plan, error: planError } = await adminClient
    .from("plans")
    .select("id")
    .eq("code", opts.tier)
    .maybeSingle<{ id: string }>()

  if (planError || !plan) {
    throw new Error(
      `provisionOrgAtTier: plan lookup for code='${opts.tier}' failed — ${
        planError?.message ?? "no row. Run `psql -f supabase/seed.sql` to seed plans."
      }`
    )
  }

  if (opts.organizationName) {
    const { error: tenantError } = await adminClient
      .from("tenants")
      .update({ name: opts.organizationName })
      .eq("id", user.tenantId)
    if (tenantError) {
      throw new Error(
        `provisionOrgAtTier: tenant rename failed — ${tenantError.message}`
      )
    }
  }

  const periodStart = new Date()
  const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000)
  const stripeSuffix = randomUUID().slice(0, 12)

  const { error: subError } = await adminClient.from("subscriptions").insert({
    tenant_id: user.tenantId,
    plan_id: plan.id,
    stripe_subscription_id: `sub_e2e_${stripeSuffix}`,
    stripe_subscription_item_id: `si_e2e_${stripeSuffix}`,
    stripe_price_id: `price_e2e_${opts.tier}_${billingInterval}`,
    stripe_product_id: `prod_e2e_${opts.tier}`,
    status,
    plan_tier: opts.tier,
    billing_interval: billingInterval,
    seat_count: 1,
    cancel_at_period_end: false,
    current_period_start: periodStart.toISOString(),
    current_period_end: periodEnd.toISOString(),
    is_current: true,
  })

  if (subError) {
    throw new Error(`provisionOrgAtTier: subscription insert failed — ${subError.message}`)
  }

  const { data: tenantRow } = await adminClient
    .from("tenants")
    .select("name")
    .eq("id", user.tenantId)
    .maybeSingle<{ name: string }>()

  return { id: user.tenantId, name: tenantRow?.name ?? `tenant ${user.tenantId}` }
}

/**
 * Tear-down counterpart for `provisionOrgAtTier`. Deletes the tenant row,
 * which cascades through subscriptions + memberships. The auth.users row
 * is owned by `auth.ts::deleteTestUser`.
 */
export async function deleteTestOrganization(orgId: string): Promise<void> {
  const { error } = await adminClient.from("tenants").delete().eq("id", orgId)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`deleteTestOrganization: best-effort cleanup of ${orgId} failed: ${error.message}`)
  }
}
