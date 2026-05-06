/**
 * Verifies the proxy-level super_admin gate on /admin/*.
 *
 *   viewer       → bounced from /admin/users to /dashboard
 *   super_admin  → /admin/users renders
 *
 * Action-layer enforcement (calling admin-only server actions with a
 * non-admin session) is covered by separate Vitest action specs.
 */
import { expect, test } from "@playwright/test"

import { createTestUser, deleteTestUser, signInAs, type TestUser } from "./fixtures/auth"

let viewer: TestUser
let superAdmin: TestUser

test.beforeAll(async () => {
  viewer = await createTestUser({ roles: ["viewer"] })
  superAdmin = await createTestUser({ roles: ["admin"], isSuperAdmin: true })
})

test.afterAll(async () => {
  await deleteTestUser(viewer.id)
  await deleteTestUser(superAdmin.id)
})

test("viewer is bounced from /admin/users to /dashboard", async ({ page }) => {
  await signInAs(page, viewer)
  await page.goto("/admin/users")
  await page.waitForURL((url) => !url.pathname.startsWith("/admin"), { timeout: 10_000 })
  expect(page.url()).toContain("/dashboard")
})

test("super_admin can load /admin/users", async ({ page }) => {
  await signInAs(page, superAdmin)
  await page.goto("/admin/users")
  await expect(page).toHaveURL(/\/admin\/users/)
})
