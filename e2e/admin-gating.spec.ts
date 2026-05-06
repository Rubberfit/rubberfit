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

// Use `let _ : TestUser | undefined` so partial-setup failures (one user
// created, the other throws) don't make `afterAll` blow up trying to
// dereference `.id` on `undefined` — that would mask the real failure.
let viewer: TestUser | undefined
let superAdmin: TestUser | undefined

test.beforeAll(async () => {
  viewer = await createTestUser({ roles: ["viewer"] })
  superAdmin = await createTestUser({ roles: ["admin"], isSuperAdmin: true })
})

test.afterAll(async () => {
  if (viewer) await deleteTestUser(viewer.id)
  if (superAdmin) await deleteTestUser(superAdmin.id)
})

function ensureSetup(label: string, value: TestUser | undefined): TestUser {
  if (!value) throw new Error(`Test setup did not initialize ${label}; check beforeAll output`)
  return value
}

test("viewer is bounced from /admin/users to /dashboard", async ({ page }) => {
  const user = ensureSetup("viewer", viewer)
  await signInAs(page, user)
  await page.goto("/admin/users")
  await page.waitForURL((url) => !url.pathname.startsWith("/admin"), { timeout: 10_000 })
  expect(page.url()).toContain("/dashboard")
})

test("super_admin can load /admin/users", async ({ page }) => {
  const user = ensureSetup("superAdmin", superAdmin)
  await signInAs(page, user)
  await page.goto("/admin/users")
  await expect(page).toHaveURL(/\/admin\/users/)
})
