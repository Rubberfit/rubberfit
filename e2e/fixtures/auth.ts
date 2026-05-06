/**
 * E2E auth fixture — ephemeral test users with arbitrary RBAC state.
 *
 * Mints `auth.users` rows via the Supabase service-role key, applies
 * the requested roles / super_admin / is_deleted on the
 * trigger-created `profiles` row, then drives the real login form so
 * browser cookies populate naturally. Tear-down deletes the auth row;
 * the profile follows via ON DELETE CASCADE.
 *
 * Requirements (in `.env.local`):
 *   - NEXT_PUBLIC_SUPABASE_URL — local or dev Supabase
 *   - SUPABASE_SERVICE_ROLE_KEY — bypass-RLS key (NEVER on prod creds)
 *
 * Why drive the form instead of cookie-injecting:
 *   The Supabase SSR cookie is base64-encoded JSON of the session and
 *   the cookie name varies by project ref. Driving the form takes
 *   ~1s but keeps the fixture independent of the cookie format, which
 *   has changed in past Supabase releases.
 */
import * as path from "node:path"

import { config as loadEnv } from "dotenv"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Page } from "@playwright/test"

loadEnv({ path: path.resolve(process.cwd(), ".env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "e2e auth fixture requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
  )
}

export const adminClient: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export interface TestUser {
  id: string
  email: string
  password: string
}

export interface CreateTestUserOptions {
  roles?: string[]
  isSuperAdmin?: boolean
  isDeleted?: boolean
  fullName?: string
}

/**
 * Mint an ephemeral user. The `handle_new_user` trigger creates the
 * profile row with defaults (`roles=['member']`, `super_admin=false`,
 * `is_deleted=false`); we then update it to the test's desired state.
 *
 * Caller MUST tear down via deleteTestUser(user.id) — typically in
 * an afterAll hook.
 */
export async function createTestUser(
  options: CreateTestUserOptions = {}
): Promise<TestUser> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `e2e-${stamp}@example.test`
  const password = `e2e-pw-${stamp}`

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: options.fullName ?? `E2E ${stamp}` },
  })
  if (createError || !created.user) {
    throw new Error(
      `createTestUser: auth.admin.createUser failed — ${createError?.message ?? "no user returned"}`
    )
  }
  const userId = created.user.id

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({
      roles: options.roles ?? ["member"],
      super_admin: options.isSuperAdmin ?? false,
      is_deleted: options.isDeleted ?? false,
    })
    .eq("id", userId)

  if (updateError) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => undefined)
    throw new Error(`createTestUser: profile update failed — ${updateError.message}`)
  }

  return { id: userId, email, password }
}

export async function deleteTestUser(userId: string): Promise<void> {
  // ON DELETE CASCADE on profiles.id REFERENCES auth.users(id) handles
  // the profile row.
  await adminClient.auth.admin.deleteUser(userId).catch(() => undefined)
}

export async function setUserDeactivated(userId: string, isDeleted: boolean): Promise<void> {
  const { error } = await adminClient
    .from("profiles")
    .update({ is_deleted: isDeleted })
    .eq("id", userId)
  if (error) throw new Error(`setUserDeactivated: ${error.message}`)
}

/**
 * Lower-level helper — fills the form and submits. Doesn't wait for
 * the redirect, so callers can either `signInAs()` (success path) or
 * stay on /login and assert error UI (deactivation, bad creds).
 */
export async function fillLoginAndSubmit(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login")
  await page.locator("#email").fill(user.email)
  await page.locator("#password").fill(user.password)
  await page.locator('button[type="submit"]:has-text("Login")').click()
}

/**
 * Drives the login form and waits for navigation away from /login.
 * Throws if sign-in fails (which keeps us on /login past the timeout).
 */
export async function signInAs(page: Page, user: TestUser): Promise<void> {
  await fillLoginAndSubmit(page, user)
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 })
}
