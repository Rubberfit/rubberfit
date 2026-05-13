/**
 * E2E billing fixture — provisions an organization + active membership
 * + current subscription row for a test user at a chosen plan tier.
 *
 * Why this exists: every gate downstream of `requireActiveSubscription`
 * (route gates in `proxy.ts`, action-layer `requireFeature` calls)
 * reads the join `organizations → organization_members(user) →
 * organization_subscriptions(is_current=true)`. The basic
 * `createTestUser` fixture only sets up the auth + profile row, so by
 * default the user lands on the recovery flow rather than the
 * dashboard. This fixture closes that loop so tier-specific E2Es can
 * exercise the gate without spinning up real Stripe sessions.
 *
 * Cleanup: `deleteTestOrganization(orgId)` removes the org row;
 * cascades drop `organization_members` and `organization_subscriptions`
 * rows. Caller must invoke in afterAll alongside `deleteTestUser`.
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
  organizationName?: string
}

/**
 * Provision an organization + active member link + current
 * subscription row at the requested tier. Returns the org id so the
 * caller can tear down in afterAll.
 *
 * Uses the service-role admin client to bypass RLS — same trust model
 * as `createTestUser`, never run against production credentials.
 */
export async function provisionOrgAtTier(
  user: TestUser,
  opts: ProvisionTierOptions
): Promise<TestOrganization> {
  const status = opts.status ?? "active"
  const orgName = opts.organizationName ?? `E2E Org ${Date.now()}-${randomUUID().slice(0, 6)}`

  const { data: orgRow, error: orgError } = await adminClient
    .from("organizations")
    .insert({
      name: orgName,
      billing_email: user.email,
      created_by: user.id,
    })
    .select("id, name")
    .single()

  if (orgError || !orgRow) {
    throw new Error(`provisionOrgAtTier: org insert failed — ${orgError?.message ?? "no row"}`)
  }

  const { error: memberError } = await adminClient.from("organization_members").insert({
    organization_id: orgRow.id,
    user_id: user.id,
    role: "owner",
    status: "active",
    invited_by: user.id,
    joined_at: new Date().toISOString(),
  })

  if (memberError) {
    // Best-effort cleanup; suppress secondary failure so the thrown
    // error reports the original member-insert problem instead of a
    // confusing delete-fallout one.
    try {
      await adminClient.from("organizations").delete().eq("id", orgRow.id)
    } catch (_cleanupErr) {
      /* preserve original signal */
    }
    throw new Error(`provisionOrgAtTier: member insert failed — ${memberError.message}`)
  }

  // current_period_end set to +30d so the gate sees a healthy sub
  // even when running across midnight UTC.
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { error: subError } = await adminClient.from("organization_subscriptions").insert({
    organization_id: orgRow.id,
    stripe_subscription_id: `sub_e2e_${randomUUID().slice(0, 12)}`,
    stripe_subscription_item_id: `si_e2e_${randomUUID().slice(0, 12)}`,
    stripe_price_id: `price_e2e_${opts.tier}`,
    stripe_product_id: `prod_e2e_${opts.tier}`,
    status,
    plan_tier: opts.tier,
    cancel_at_period_end: false,
    current_period_end: periodEnd,
    is_current: true,
  })

  if (subError) {
    try {
      await adminClient.from("organizations").delete().eq("id", orgRow.id)
    } catch (_cleanupErr) {
      /* preserve original signal */
    }
    throw new Error(`provisionOrgAtTier: subscription insert failed — ${subError.message}`)
  }

  return { id: orgRow.id, name: orgRow.name as string }
}

/**
 * Tear-down counterpart for `provisionOrgAtTier`. Relies on
 * cascading deletes for `organization_members` and
 * `organization_subscriptions`. Errors surface (logged + rethrown)
 * rather than swallowed so leaked fixture data is visible in CI.
 */
export async function deleteTestOrganization(orgId: string): Promise<void> {
  const { error } = await adminClient.from("organizations").delete().eq("id", orgId)
  if (error) {
    // eslint-disable-next-line no-console
    console.error(`deleteTestOrganization: failed to delete ${orgId}`, error)
    throw new Error(`deleteTestOrganization: ${error.message}`)
  }
}
