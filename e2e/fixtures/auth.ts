/**
 * E2E auth fixture — ephemeral test users with arbitrary RBAC state.
 *
 * Mints `auth.users` rows via the Supabase service-role key, sets the
 * `is_platform_admin` flag on the trigger-created `profiles` row, then
 * creates a fresh tenant + `memberships` row with the requested roles
 * (roles are per-tenant under the new schema). Tear-down deletes the
 * auth row (profile cascades) and the tenant (memberships cascade).
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
  tenantId: string
  membershipId: string
}

export interface CreateTestUserOptions {
  roles?: string[]
  isSuperAdmin?: boolean
  isInaccessible?: boolean
  fullName?: string
}

interface UpdatedRow {
  id: string
}

/**
 * Mint an ephemeral user with their own freshly-minted tenant. The
 * `handle_new_user` trigger creates the profile row; the fixture then:
 *   1. Sets `is_platform_admin` if requested
 *   2. Creates a tenant
 *   3. Creates a `memberships` row in that tenant with the requested
 *      roles (and `deleted_at` set if `isInaccessible: true`)
 *
 * Caller MUST tear down via deleteTestUser(user.id) — typically in
 * an afterAll hook.
 */
export async function createTestUser(options: CreateTestUserOptions = {}): Promise<TestUser> {
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

  // The DDD migration removed the handle_new_user trigger that used to auto-create
  // a profiles row from auth.users. Production now upserts the profile explicitly
  // in the OAuth callback (authService.upsertProfileFromAuth); the fixture must do
  // the same before any FK to profiles fires. full_name is a generated column —
  // do not include it.
  const { error: profileError } = await adminClient
    .from("profiles")
    .upsert({ id: userId, email }, { onConflict: "id" })
  if (profileError) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => undefined)
    throw new Error(`createTestUser: profile upsert failed — ${profileError.message}`)
  }

  if (options.isSuperAdmin === true) {
    const { data: profileUpdated, error: profileError } = await adminClient
      .from("profiles")
      .update({ is_platform_admin: true })
      .eq("id", userId)
      .select("id")

    if (
      profileError ||
      !profileUpdated ||
      (profileUpdated as UpdatedRow[] | null)?.length !== 1
    ) {
      await adminClient.auth.admin.deleteUser(userId).catch(() => undefined)
      const detail =
        profileError?.message ??
        `expected 1 affected profiles row, got ${
          (profileUpdated as UpdatedRow[] | null)?.length ?? 0
        }`
      throw new Error(`createTestUser: profile update failed — ${detail}`)
    }
  }

  const tenantSlug = `e2e-${stamp}`
  const { data: tenant, error: tenantError } = await adminClient
    .from("tenants")
    .insert({ name: `E2E ${stamp}`, slug: tenantSlug })
    .select("id")
    .single<{ id: string }>()
  if (tenantError || !tenant) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => undefined)
    throw new Error(`createTestUser: tenant insert failed — ${tenantError?.message ?? "no row"}`)
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("memberships")
    .insert({
      tenant_id: tenant.id,
      profile_id: userId,
      roles: options.roles ?? ["member"],
      deleted_at: options.isInaccessible === true ? new Date().toISOString() : null,
    })
    .select("id")
    .single<{ id: string }>()
  if (membershipError || !membership) {
    await adminClient.from("tenants").delete().eq("id", tenant.id)
    await adminClient.auth.admin.deleteUser(userId).catch(() => undefined)
    throw new Error(
      `createTestUser: membership insert failed — ${membershipError?.message ?? "no row"}`
    )
  }

  return { id: userId, email, password, tenantId: tenant.id, membershipId: membership.id }
}

export async function deleteTestUser(userId: string): Promise<void> {
  // Best-effort cleanup. There is a pre-existing schema defect introduced by the
  // admin schema migration (20260509000002_admin_schema.sql): admin_activity_log
  // has append-only DO INSTEAD NOTHING rules on UPDATE/DELETE, but the FK
  // admin_activity_log_actor_id_fkey REFERENCES auth.users(id) ON DELETE SET NULL.
  // The FK trigger issues an UPDATE that the rule rewrites to a no-op, and
  // Postgres reports "referential integrity query gave unexpected result". This
  // means ANY auth.users delete fails, even for users that never wrote an audit
  // row. The fix is a schema migration (drop the FK; keep actor_email for human
  // identity); tracked separately. For e2e cleanup we log and continue —
  // orphan auth.users rows are harmless and get cleared by `supabase db reset`.
  const { error } = await adminClient.auth.admin.deleteUser(userId)
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`deleteTestUser: best-effort cleanup failed for ${userId}: ${error.message}`)
  }
}

/**
 * Flips accessibility for a previously-created test user by soft-
 * deleting (or restoring) every active membership row they own.
 * Mirrors the production admin "deactivate user" flow which writes
 * `memberships.deleted_at` per-tenant.
 */
export async function setUserDeactivated(userId: string, isInaccessible: boolean): Promise<void> {
  const deleted_at = isInaccessible ? new Date().toISOString() : null
  const { error } = await adminClient
    .from("memberships")
    .update({ deleted_at })
    .eq("profile_id", userId)
  if (error) throw new Error(`setUserDeactivated: ${error.message}`)
}

/**
 * Lower-level helper — fills the form and submits. Doesn't wait for
 * the redirect, so callers can either `signInAs()` (success path) or
 * stay on /login and assert error UI (deactivation, bad creds).
 */
export async function fillLoginAndSubmit(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login")
  // PR #178 (`/login` redesign) renamed the inputs to `login-email` /
  // `login-password` (to avoid clashing with the password-reset form
  // on the same auth shell) and changed the submit copy from "Login"
  // to "Sign in". Fixture was missed in that PR and rot meant
  // every E2E that signs in (admin-gating, packing, deactivation)
  // broke until Phase 6 PR 3.5 caught it.
  await page.locator("#login-email").fill(user.email)
  await page.locator("#login-password").fill(user.password)
  await page.locator('button[type="submit"]:has-text("Sign in")').click()
}

/**
 * Drives the login form and waits for navigation away from /login.
 * Throws if sign-in fails (which keeps us on /login past the timeout).
 */
export async function signInAs(page: Page, user: TestUser): Promise<void> {
  await fillLoginAndSubmit(page, user)
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 })
}
