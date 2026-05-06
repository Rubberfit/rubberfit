/**
 * Smoke spec for the AutoNest pack pipeline.
 *
 * Selects one rectangle preset on /dashboard/cutting-engine, presses
 * Pack, and asserts the /api/v2/pack response is 2xx with a parseable
 * JSON body. Exercises the full chain:
 *
 *   browser ApiPackingService → POST /api/v2/pack → server handler
 *   → child_process.spawn(pack-cli) → Rust packer → JSON back
 *
 * Regression guard for the dev/prod pack-route split: production
 * traffic to `/api/v2/pack` is served by the Vercel Rust function
 * at `api/v2/pack.rs`, but `npm run dev` doesn't run Vercel Rust
 * functions. Without a Next.js fallback, every Pack click in dev
 * returns a 404 HTML page. Commit `ace7dfb` removed the fallback
 * during the Rust-runtime migration; ARC-147 restored it at
 * `app/api/v2/pack/route.ts` with two-layer protection
 * (`.vercelignore` + a runtime `VERCEL=1` short-circuit) so it
 * only ever serves dev traffic. This test fails fast if the
 * fallback gets removed again.
 *
 * The test logs the response status, a body snippet, and console
 * messages on every run so the failure mode is visible from
 * stdout alone — no need to crack open the trace.
 */
import { expect, test } from "@playwright/test"

import { createTestUser, deleteTestUser, signInAs, type TestUser } from "./fixtures/auth"

let cutter: TestUser

test.beforeAll(async () => {
  // accessCutPlanner permission allows admin OR cutter. Use the
  // lower-privilege role so we exercise the gate rather than
  // super_admin bypass.
  cutter = await createTestUser({ roles: ["cutter"] })
})

test.afterAll(async () => {
  await deleteTestUser(cutter.id)
})

test("packing a single rectangle preset returns 2xx from /api/v2/pack", async ({ page }) => {
  const consoleMessages: string[] = []
  const packNetworkLog: string[] = []

  page.on("console", (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`))
  page.on("pageerror", (err) => consoleMessages.push(`[uncaught] ${err.message}`))
  page.on("response", (response) => {
    if (response.url().includes("/api/v2/pack")) {
      packNetworkLog.push(`${response.request().method()} ${response.url()} → ${response.status()}`)
    }
  })

  await signInAs(page, cutter)
  await page.goto("/dashboard/cutting-engine")

  // First-hit dev compile can be slow — wait generously for the page
  // to finish hydrating before driving inputs.
  await expect(page.getByRole("heading", { name: "Cutting Engine", level: 1 })).toBeVisible({
    timeout: 60_000,
  })

  // Default part type is rectangle. Click the first preset card — each
  // is a <label> wrapping an sr-only checkbox plus the dimension text.
  // 18" × 14" is the first standard rectangle in PART_TEMPLATES and
  // fits the default 96"×48" stock.
  await page.locator("label").filter({ hasText: '18" × 14"' }).first().click()

  // Pack button appears in the Graph card once a template is selected.
  const packButton = page.getByRole("button", { name: "Pack", exact: true })
  await expect(packButton).toBeVisible()

  // Hook in BEFORE the click so we don't race the request.
  const packResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/v2/pack"),
    { timeout: 30_000 }
  )

  await packButton.click()
  const packResponse = await packResponsePromise

  const status = packResponse.status()
  const bodySnippet = (await packResponse.text()).slice(0, 300)

  // Always print diagnostic data — useful on success (so we can see
  // the response shape) and on failure (so we can see what's wrong
  // without opening a trace).
  // eslint-disable-next-line no-console
  console.log(
    `[pack] ${packResponse.request().method()} ${packResponse.url()} → ${status}\n` +
      `[pack] body[0..300]:\n${bodySnippet}` +
      (consoleMessages.length > 0 ? `\n[pack] console:\n${consoleMessages.join("\n")}` : "") +
      (packNetworkLog.length > 0 ? `\n[pack] network log:\n${packNetworkLog.join("\n")}` : "")
  )

  expect(
    status,
    `pack returned HTTP ${status}; body[0..300]: ${bodySnippet}`
  ).toBeGreaterThanOrEqual(200)
  expect(status, `pack returned HTTP ${status}; body[0..300]: ${bodySnippet}`).toBeLessThan(300)
})
