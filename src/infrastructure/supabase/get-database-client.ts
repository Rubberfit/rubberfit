import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Runtime-aware Supabase client resolver.
 *
 * Background: `@/src/infrastructure/models/supabase` exports a browser
 * singleton built with `createBrowserClient` (auth session lives in
 * localStorage). When a server action invokes an infrastructure service,
 * that singleton runs in Node — no localStorage, no JWT, no `auth.uid()`.
 * Postgres RLS sees an unauthenticated request and rejects writes with
 * error code 42501 even though the caller is signed in.
 *
 * Fix: services call `await getDatabaseClient()` instead of importing the
 * browser singleton directly. On the server, we return a cookie-bound
 * `createServerClient` that extracts the JWT from the request cookies —
 * RLS continues to enforce `auth.uid() = user_id` exactly as it did from
 * the browser. We never use the service-role key for normal CRUD; RLS
 * stays the security model.
 *
 * The factory is registered at action / route-handler entry via
 * `ensureDatabaseFactoryRegistered()` (idempotent). We chose explicit
 * entry-time registration over `app/layout.tsx` side-effect imports
 * because Next.js does not contractually guarantee layout module
 * evaluation before a server-action POST in serverless workers.
 */

export type DatabaseClient = SupabaseClient

type ServerFactory = () => Promise<DatabaseClient>

let serverFactory: ServerFactory | null = null

/**
 * Server-only. Registers (or replaces) the factory used to build a
 * cookie-bound Supabase client for the current request. Idempotent —
 * calling it more than once is fine; later calls overwrite. The
 * registration is process-global, but each invocation of the factory
 * itself reads `next/headers cookies()`, which is request-scoped via
 * Next.js's own AsyncLocalStorage. Concurrent requests therefore each
 * see their own cookies.
 */
export function registerServerDatabaseClientFactory(factory: ServerFactory): void {
  serverFactory = factory
}

export function isServerDatabaseClientFactoryRegistered(): boolean {
  return serverFactory !== null
}

/**
 * Returns a Supabase client appropriate for the current runtime:
 *
 *   - Server (Node): cookie-bound `createServerClient` produced by the
 *     registered factory. RLS-respecting.
 *   - Browser: the existing `createBrowserClient` singleton.
 *
 * Server callers must have called `ensureDatabaseFactoryRegistered()`
 * earlier in the request (typically the first line of every server
 * action). If they haven't, this throws — fail-fast is preferable to
 * silently falling back to a useless client.
 */
export async function getDatabaseClient(): Promise<DatabaseClient> {
  if (typeof window === "undefined") {
    if (!serverFactory) {
      throw new Error(
        "Server database client factory not registered. " +
          "Call ensureDatabaseFactoryRegistered() at server-action entry."
      )
    }
    return serverFactory()
  }

  const { supabase } = await import("@/src/infrastructure/models/supabase")
  return supabase as unknown as DatabaseClient
}
