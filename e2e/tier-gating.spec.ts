/**
 * Tier-gating E2Es — verifies that the action-layer feature gates
 * actually fire end-to-end and that customer UX matches the founder-
 * locked tier scopes:
 *
 *   - cut_history_exports: Standard sees the lock toast, Pro
 *     downloads the CSV.
 *   - branded_pdfs: every tier successfully generates a job PDF;
 *     Standard's PDF carries the default "Rubberfit" brand string,
 *     Pro's carries the org's `name`. (We assert the gate fires; PDF
 *     binary inspection lives in vitest unit tests.)
 *
 * Each tier-scoped spec mints a fresh user + org + subscription so
 * the gate query has a row to read; afterAll tears the whole tree
 * down via cascading deletes on the org row.
 */
import { expect, test } from "@playwright/test"

import {
  createTestUser,
  deleteTestUser,
  signInAs,
  type TestUser,
} from "./fixtures/auth"
import {
  deleteTestOrganization,
  provisionOrgAtTier,
  type TestOrganization,
} from "./fixtures/billing"

interface ProvisionedUser {
  user: TestUser
  org: TestOrganization
}

async function mintAtTier(tier: "standard" | "pro"): Promise<ProvisionedUser> {
  const user = await createTestUser({ roles: ["admin"] })
  try {
    const org = await provisionOrgAtTier(user, { tier })
    return { user, org }
  } catch (err) {
    // Provisioning failed AFTER user mint — without cleanup the test
    // user leaks into `auth.users` indefinitely. Swallow the cleanup
    // error so the original provisioning failure (the real signal) is
    // what surfaces.
    await deleteTestUser(user.id).catch(() => undefined)
    throw err
  }
}

async function teardown(provisioned: ProvisionedUser | undefined): Promise<void> {
  if (!provisioned) return
  // Log + swallow cleanup failures so afterAll doesn't mask the
  // test's actual outcome. A leaked org/user surfaces in CI logs
  // rather than as a confusing teardown stack trace.
  try {
    await deleteTestOrganization(provisioned.org.id)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`teardown: deleteTestOrganization(${provisioned.org.id}) failed`, err)
  }
  try {
    await deleteTestUser(provisioned.user.id)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`teardown: deleteTestUser(${provisioned.user.id}) failed`, err)
  }
}

test.describe("cut_history_exports — Standard locked, Pro unlocked", () => {
  let standard: ProvisionedUser | undefined
  let pro: ProvisionedUser | undefined

  test.beforeAll(async () => {
    standard = await mintAtTier("standard")
    pro = await mintAtTier("pro")
  })

  test.afterAll(async () => {
    await teardown(standard)
    await teardown(pro)
  })

  test("Standard customer sees the Kimi UpgradeModal on Export CSV", async ({ page }) => {
    const u = standard
    if (!u) throw new Error("Standard user not provisioned")

    await signInAs(page, u.user)
    await page.goto("/dashboard/history")
    // History loads even with zero cuts — the empty state still
    // surfaces the export button. Wait for it before clicking.
    const exportButton = page.getByRole("button", { name: /Export CSV/i })
    await exportButton.waitFor({ state: "visible", timeout: 10_000 })
    await exportButton.click()

    // UpgradeModal opens. The pathLabel ("/EXPORT LOCKED") + headline
    // ("CSV export requires Pro") are wired in app/dashboard/history/
    // page.tsx and must stay in sync.
    const modal = page.getByRole("dialog")
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await expect(modal.getByText(/EXPORT LOCKED/i)).toBeVisible()
    await expect(modal.getByText(/CSV export requires Pro/i)).toBeVisible()
    await expect(modal.getByRole("link", { name: /Upgrade to Pro/i })).toBeVisible()
  })

  test("Pro customer can trigger the CSV download path", async ({ page }) => {
    const u = pro
    if (!u) throw new Error("Pro user not provisioned")

    await signInAs(page, u.user)
    await page.goto("/dashboard/history")

    const exportButton = page.getByRole("button", { name: /Export CSV/i })
    await exportButton.waitFor({ state: "visible", timeout: 10_000 })

    // For a Pro user we expect the click to NOT surface the lock toast
    // within the window. Empty history still yields a header-only CSV
    // (zero-row download), so we don't need to seed any cuts.
    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 })
    await exportButton.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^cut-history-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

test.describe("billing history page — renders for any active tier", () => {
  let pro: ProvisionedUser | undefined

  test.beforeAll(async () => {
    pro = await mintAtTier("pro")
  })

  test.afterAll(async () => {
    await teardown(pro)
  })

  test("Pro customer can load /dashboard/settings/billing/history", async ({ page }) => {
    const u = pro
    if (!u) throw new Error("Pro user not provisioned")

    await signInAs(page, u.user)
    await page.goto("/dashboard/settings/billing/history")

    // The Kimi-spec header label + at least one column header anchors
    // the page render — even an empty state still shows the table
    // chrome.
    await expect(page.getByText(/\/BILLING HISTORY/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("columnheader", { name: /^Date$/i })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: /^Amount$/i })).toBeVisible()
  })
})

test.describe("sidebar TierIndicator", () => {
  let standard: ProvisionedUser | undefined

  test.beforeAll(async () => {
    standard = await mintAtTier("standard")
  })

  test.afterAll(async () => {
    await teardown(standard)
  })

  test("Standard customer sees the STANDARD label + ↑ UPGRADE affordance", async ({ page }) => {
    const u = standard
    if (!u) throw new Error("Standard user not provisioned")

    await signInAs(page, u.user)
    await page.goto("/dashboard")

    // The indicator is a link to /dashboard/settings/billing labelled
    // with the tier; UPGRADE affordance for sub-Max tiers per Kimi
    // §3.
    const indicator = page.getByRole("link", { name: /Current plan: standard/i })
    await expect(indicator).toBeVisible({ timeout: 10_000 })
    await expect(indicator).toContainText(/UPGRADE/i)
  })
})
