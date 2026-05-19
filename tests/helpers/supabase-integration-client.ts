import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Test-only Supabase client factory for integration tests that exercise
 * RLS end-to-end against a real local Supabase stack.
 *
 * The integration suite assumes:
 *   • `supabase start` has been run (port 54321 reachable)
 *   • `supabase db reset` has been run with the seed.sql at HEAD,
 *     producing the "Dev Tenant" + "Second Tenant" users defined in
 *     `src/infrastructure/supabase/seed.sql`.
 *
 * `signInAs()` calls GoTrue's password-grant endpoint directly via the
 * Supabase JS client. The returned client carries the user's JWT, so
 * every subsequent query runs under that user's `auth.uid()` and the
 * tenant-scoped RLS policies enforce isolation.
 *
 * URL + anon key come from env (Vitest loads `.env.local`); the local
 * Supabase stack pins these to the well-known dev values. Fall back to
 * those defaults so the helper still works when env vars haven't been
 * shimmed into the test process (e.g. fresh clone, no IDE env loader).
 */

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321"
const LOCAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_SUPABASE_URL
}

function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? LOCAL_SUPABASE_ANON_KEY
}

/**
 * Build a fresh unauthenticated client. Use only for sign-in flows or
 * truly public-anon test cases — RLS will block tenant-scoped reads.
 */
export function makeAnonClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Sign in as a seed user and return their tenant-scoped client. Throws
 * a descriptive error if the local stack isn't reachable or the seed
 * isn't applied — those are the two common failure modes when running
 * integration tests.
 */
export async function signInAs(email: string, password = "changeme123"): Promise<SupabaseClient> {
  const client = makeAnonClient()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(
      `[integration-helper] signInAs(${email}) failed: ${error.message}. ` +
        `Confirm \`supabase start\` is running and \`npm run supabase:reset\` ` +
        `has applied the current seed.sql (which provisions tenant-A + tenant-B users).`
    )
  }
  return client
}

/**
 * Best-effort sign-out so the next test starts from a clean session.
 * Failures are swallowed — the client is discarded either way.
 */
export async function signOut(client: SupabaseClient): Promise<void> {
  try {
    await client.auth.signOut()
  } catch {
    // ignore
  }
}

/** Well-known seed user emails — keep in sync with src/infrastructure/supabase/seed.sql */
export const SEED_USERS = {
  tenantA: {
    admin: "admin@rema.local",
    manager: "manager@rema.local",
    supervisor: "supervisor@rema.local",
    cutter: "cutter@rema.local",
    member: "member@rema.local",
    viewer: "viewer@rema.local",
  },
  tenantB: {
    admin: "admin@tenant-b.local",
    member: "member@tenant-b.local",
  },
} as const

/** Well-known seed tenant slugs — keep in sync with src/infrastructure/supabase/seed.sql */
export const SEED_TENANT_SLUGS = {
  tenantA: "dev-tenant",
  tenantB: "second-tenant",
} as const
