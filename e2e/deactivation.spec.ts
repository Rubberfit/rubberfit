/**
 * Verifies `is_deleted` enforcement at both auth touchpoints.
 *
 *   1. Fresh sign-in by a deactivated user
 *      → `authService.signIn` checks `isProfileDeleted` and rejects;
 *        the form stays on /login and surfaces a sonner toast.
 *
 *   2. Active session deactivated mid-session
 *      → next request to a permission-gated path triggers `proxy.ts`'s
 *        `access.isDeleted` check, which calls `auth.signOut()` and
 *        redirects to /login?deactivated=1.
 *
 * The mid-session test uses a `manager` because
 * /dashboard/inventory/purchase-orders requires `manageRolls` (admin
 * OR manager). The proxy's permission-gate codepath is what fires the
 * isDeleted check, so we need a route with a permission requirement.
 */
import { expect, test } from "@playwright/test"

import {
  createTestUser,
  deleteTestUser,
  fillLoginAndSubmit,
  setUserDeactivated,
  signInAs,
} from "./fixtures/auth"

const userIdsToCleanup: string[] = []

test.afterAll(async () => {
  for (const id of userIdsToCleanup) {
    await deleteTestUser(id)
  }
  userIdsToCleanup.length = 0
})

test("deactivated user cannot sign in", async ({ page }) => {
  const user = await createTestUser({ roles: ["member"], isDeleted: true })
  userIdsToCleanup.push(user.id)

  await fillLoginAndSubmit(page, user)

  // Sign-in fails → stays on /login. Give the network call ~2.5s to
  // settle, then assert we never navigated away.
  await page.waitForTimeout(2_500)
  expect(page.url()).toContain("/login")
})

test("user deactivated mid-session is bounced from gated routes", async ({ page }) => {
  const user = await createTestUser({ roles: ["manager"] })
  userIdsToCleanup.push(user.id)

  await signInAs(page, user)

  // Confirm we landed somewhere inside /dashboard. resolvePostAuthRedirect
  // sends managers to a manager-appropriate page; we just assert it's
  // somewhere under /dashboard, not which page.
  await expect(page).toHaveURL(/\/dashboard/)

  // Server-side deactivation. The browser session is still active —
  // the next gated nav is what actually triggers the bounce.
  await setUserDeactivated(user.id, true)

  await page.goto("/dashboard/inventory/purchase-orders")
  await page.waitForURL(/\/login\?.*deactivated=1/, { timeout: 10_000 })
})
