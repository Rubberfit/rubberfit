import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  isServerDatabaseClientFactoryRegistered,
  registerServerDatabaseClientFactory,
  type DatabaseClient,
} from "@/src/infrastructure/supabase/get-database-client"

/**
 * Builds a fresh, cookie-bound Supabase client for the CURRENT request.
 *
 * `next/headers cookies()` is request-scoped (Next.js maintains its own
 * AsyncLocalStorage for the request), so calling this from a service
 * inside a server action returns the cookies from THAT action's request,
 * even when other requests are in-flight on the same Node worker. The
 * client is constructed per-call and not shared across requests — that's
 * a Supabase SSR design contract.
 *
 * RLS-respecting: we use the anon key, not the service role. The anon
 * key alone has no permissions; the cookie-borne JWT carries the
 * caller's `auth.uid()` and Postgres enforces RLS as usual.
 */
async function buildRequestScopedClient(): Promise<DatabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      "Supabase env not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }
  const cookieStore = await cookies()
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // Server actions don't refresh tokens. Route-level layout / proxy
      // owns refresh; setting cookies from a service action is unsafe
      // (response stream may already be open).
      setAll: () => {},
    },
  })
  return client as unknown as SupabaseClient
}

/**
 * Idempotent. Call this as the first line of every server action / route
 * handler that touches the database. Codex flagged layout-based
 * registration as the highest-risk pattern (Next.js does NOT guarantee
 * `app/layout.tsx` module evaluation before a server-action POST in
 * serverless workers). Action-entry registration removes that risk.
 *
 * Cost is negligible: the factory itself does not run here, only the
 * registration of the factory function.
 */
export function ensureDatabaseFactoryRegistered(): void {
  if (isServerDatabaseClientFactoryRegistered()) return
  registerServerDatabaseClientFactory(buildRequestScopedClient)
}
