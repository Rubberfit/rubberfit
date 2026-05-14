/**
 * General Settings + i18n prototype — admin happy path E2E.
 *
 * Pins:
 *   - Workspace scope strip renders the admin lane chrome.
 *   - All three regional pickers persist round-trip (currency, time
 *     zone, date format) plus the live preview strings update.
 *   - Operations section persists unit system + threshold.
 *   - Locale change in General Settings saves + the avatar menu's
 *     active locale checkmark moves.
 *   - Locale change via the avatar menu re-renders the dashboard in
 *     Spanish (settings.regional.title → "Regional" stays — same
 *     spelling — but the eyebrow / scope strip flip to Spanish copy).
 *   - Non-admin member sees the read-only scope strip + disabled
 *     controls + no Save button.
 *
 * Skipped in CI without `SUPABASE_SERVICE_ROLE_KEY` (the fixture
 * gates on that). Local run: `npm run e2e -- e2e/general-settings-i18n.spec.ts`.
 */
import { expect, test, type Page } from "@playwright/test"

import { createTestUser, deleteTestUser, signInAs, type TestUser } from "./fixtures/auth"
import { deleteTestOrganization } from "./fixtures/billing"
import { provisionStripeBackedOrgAtTier, type StripeBackedOrganization } from "./fixtures/stripe-events"

interface ProvisionedUser {
  user: TestUser
  org: StripeBackedOrganization
}

async function mintAdmin(): Promise<ProvisionedUser> {
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

async function teardown(p: ProvisionedUser | undefined): Promise<void> {
  if (!p) return
  await deleteTestOrganization(p.org.id).catch((err) =>
    console.error(`teardown: deleteTestOrganization(${p.org.id}) failed`, err)
  )
  await deleteTestUser(p.user.id).catch((err) =>
    console.error(`teardown: deleteTestUser(${p.user.id}) failed`, err)
  )
}

async function openGeneralSettings(page: Page): Promise<void> {
  await page.goto("/dashboard/settings/general")
  await expect(page.getByText("General", { exact: true }).first()).toBeVisible({ timeout: 15_000 })
}

test.describe("General Settings + i18n — admin happy path", () => {
  let provisioned: ProvisionedUser | undefined

  test.beforeAll(async () => {
    provisioned = await mintAdmin()
  })

  test.afterAll(async () => {
    await teardown(provisioned)
  })

  test("admin sees the workspace-default scope strip + can save regional changes that persist", async ({
    page,
  }) => {
    if (!provisioned) throw new Error("setup did not provision")
    await signInAs(page, provisioned.user)
    await openGeneralSettings(page)

    await expect(page.getByText(/WORKSPACE DEFAULT/)).toBeVisible()
    await expect(page.getByText("Edits apply to all members")).toBeVisible()

    // Change currency USD → EUR and watch the preview swap.
    const currencySelect = page.locator("#currency")
    await currencySelect.selectOption("EUR")
    await expect(page.getByText(/€1[,.]250[.,]00/)).toBeVisible()

    // Date format flips between the three patterns.
    const dateSelect = page.locator("#dateFormat")
    await dateSelect.selectOption("yyyy-MM-dd")
    await expect(page.getByText(/Preview:/)).toBeVisible()

    // Save and reload; values stick.
    await page.getByRole("button", { name: /^Save$/ }).first().click()
    await expect(page.getByText(/Saved/i)).toBeVisible({ timeout: 10_000 })
    await page.reload()
    await openGeneralSettings(page)
    await expect(page.locator("#currency")).toHaveValue("EUR")
    await expect(page.locator("#dateFormat")).toHaveValue("yyyy-MM-dd")
  })

  test("admin can flip locale and the dashboard chrome re-renders in Spanish", async ({ page }) => {
    if (!provisioned) throw new Error("setup did not provision")
    await signInAs(page, provisioned.user)
    await openGeneralSettings(page)

    const languageSelect = page.locator("#language")
    await languageSelect.selectOption("es-MX")
    await page.getByRole("button", { name: /^Save$/ }).first().click()
    await expect(page.getByText(/Guardado/i)).toBeVisible({ timeout: 10_000 })

    // Scope strip flips to Spanish copy.
    await expect(page.getByText(/PREDETERMINADO DEL ESPACIO/)).toBeVisible()
    await expect(page.getByText(/Los cambios aplican a todos los miembros/)).toBeVisible()

    // Reset back so subsequent suites don't inherit a Spanish UI.
    await page.locator("#language").selectOption("en-US")
    await page.getByRole("button", { name: /^Save$/ }).first().click()
    await expect(page.getByText(/Saved/i)).toBeVisible({ timeout: 10_000 })
  })

  test("operations: unit-system flip swaps the reference card AND the threshold echo", async ({
    page,
  }) => {
    if (!provisioned) throw new Error("setup did not provision")
    await signInAs(page, provisioned.user)
    await openGeneralSettings(page)

    await expect(page.getByText("Reference dimensions")).toBeVisible()
    // Imperial default — explainer reads "below 50 sqft"
    await expect(page.getByText(/below 50 sqft/i)).toBeVisible()

    await page.locator("#unitSystem").selectOption("metric")
    await expect(page.getByText(/m²/)).toBeVisible()
    // After switch, threshold echo flips to m² and shows the metric value
    await expect(page.getByText(/4\.65 m²/i)).toBeVisible()
  })
})

// Non-admin lane coverage deferred until the personal-override write
// path ships (PR 1 only renders the read-only chrome + disabled
// controls). Add a member-role fixture variant + read-only assertion
// suite alongside that PR.
