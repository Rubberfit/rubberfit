/**
 * Portal-driven tier change E2E.
 *
 * Stripe Billing Portal is hosted off-process, so this drives the part
 * Rubberfit owns: a signed `customer.subscription.updated` event whose
 * subscription metadata is stale but whose active price has rotated.
 */
import { expect, test, type Page } from "@playwright/test"

import { createTestUser, deleteTestUser, signInAs, type TestUser } from "./fixtures/auth"
import { deleteTestOrganization } from "./fixtures/billing"
import {
  deleteStripeEvent,
  makePortalUpgradeToMaxAnnualEvent,
  MAX_ANNUAL_PRICE_ID,
  MAX_PRODUCT_ID,
  provisionStripeBackedOrgAtTier,
  readCurrentSubscriptionForOrg,
  type StripeBackedOrganization,
} from "./fixtures/stripe-events"

interface ProvisionedPortalUser {
  user: TestUser
  org: StripeBackedOrganization
}

async function mintProPortalUser(): Promise<ProvisionedPortalUser> {
  const user = await createTestUser({ roles: ["admin"] })
  try {
    const org = await provisionStripeBackedOrgAtTier(user, {
      tier: "pro",
      billingInterval: "monthly",
      stripePriceId: "price_pro_monthly_test",
      stripeProductId: "rubberfit_pro",
    })
    return { user, org }
  } catch (err) {
    await deleteTestUser(user.id).catch(() => undefined)
    throw err
  }
}

async function teardown(
  provisioned: ProvisionedPortalUser | undefined,
  eventId: string | undefined
): Promise<void> {
  if (eventId) {
    try {
      await deleteStripeEvent(eventId)
    } catch (err) {
      console.error(`teardown: deleteStripeEvent(${eventId}) failed`, err)
    }
  }
  if (!provisioned) return
  try {
    await deleteTestOrganization(provisioned.org.id)
  } catch (err) {
    console.error(`teardown: deleteTestOrganization(${provisioned.org.id}) failed`, err)
  }
  try {
    await deleteTestUser(provisioned.user.id)
  } catch (err) {
    console.error(`teardown: deleteTestUser(${provisioned.user.id}) failed`, err)
  }
}

function sidebarTierLink(page: Page, tier: "pro" | "max") {
  return page.getByRole("link", { name: new RegExp(`Current plan: ${tier}`, "i") })
}

async function expectCurrentPlanTier(page: Page, tierLabel: "PRO" | "MAX"): Promise<void> {
  const currentPlanCard = page.locator("section").filter({ hasText: "Billing interval" }).first()
  await expect(currentPlanCard).toBeVisible({ timeout: 10_000 })
  await expect(currentPlanCard.getByText(tierLabel, { exact: true })).toBeVisible()
}

async function expectPlanActionLabels(
  page: Page,
  expectedLabels: readonly [string, string, string]
): Promise<void> {
  const compareSection = page.locator("section").filter({ hasText: "Compare plans" }).first()
  await expect(compareSection).toBeVisible({ timeout: 10_000 })
  const buttons = compareSection.getByRole("button")
  await expect(buttons).toHaveCount(expectedLabels.length)

  for (const [index, expectedLabel] of expectedLabels.entries()) {
    await expect(buttons.nth(index)).toHaveText(expectedLabel)
  }
}

test.describe("Stripe Portal tier-change webhook", () => {
  let provisioned: ProvisionedPortalUser | undefined
  let postedEventId: string | undefined

  test.beforeAll(async () => {
    provisioned = await mintProPortalUser()
  })

  test.afterAll(async () => {
    await teardown(provisioned, postedEventId)
  })

  test("uses the rotated price to move a Pro org to Max end-to-end", async ({ page, request }) => {
    const fixture = provisioned
    if (!fixture) throw new Error("Portal user not provisioned")

    await signInAs(page, fixture.user)
    await page.goto("/dashboard/settings/billing")

    await expect(sidebarTierLink(page, "pro")).toBeVisible({ timeout: 10_000 })
    await expectCurrentPlanTier(page, "PRO")
    await expectPlanActionLabels(page, ["Downgrade", "Current plan", "Upgrade"])

    const signedEvent = makePortalUpgradeToMaxAnnualEvent({
      organizationId: fixture.org.id,
      stripeCustomerId: fixture.org.stripeCustomerId,
      stripeSubscriptionId: fixture.org.stripeSubscriptionId,
      stripeSubscriptionItemId: fixture.org.stripeSubscriptionItemId,
    })
    postedEventId = signedEvent.eventId

    const response = await request.post("/api/stripe/webhook", {
      data: signedEvent.payload,
      headers: {
        "content-type": "application/json",
        "stripe-signature": signedEvent.signature,
      },
    })
    const responseText = await response.text()
    expect(response.ok(), responseText).toBe(true)
    expect(responseText).toContain(signedEvent.eventId)

    const current = await readCurrentSubscriptionForOrg(fixture.org.id)
    expect(current).toMatchObject({
      organization_id: fixture.org.id,
      stripe_subscription_id: fixture.org.stripeSubscriptionId,
      stripe_subscription_item_id: fixture.org.stripeSubscriptionItemId,
      stripe_price_id: MAX_ANNUAL_PRICE_ID,
      stripe_product_id: MAX_PRODUCT_ID,
      plan_tier: "max",
      billing_interval: "annual",
      status: "active",
      last_stripe_event_id: signedEvent.eventId,
      is_current: true,
    })

    await page.reload()
    await expect(sidebarTierLink(page, "max")).toBeVisible({ timeout: 10_000 })
    await expectCurrentPlanTier(page, "MAX")
    await expectPlanActionLabels(page, ["Downgrade", "Downgrade", "Current plan"])
  })
})
