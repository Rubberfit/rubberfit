import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { type NextRequest } from "next/server"

/**
 * Anon client — reads the auth session from request cookies.
 * Use ONLY for `supabase.auth.getUser()` to identify the caller.
 * Returns null when env vars are missing.
 */
export function makeAuthClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: () => {},
    },
  })
}

/**
 * Service-role client — bypasses RLS entirely.
 * Use for ALL database operations inside API routes; authorization is enforced
 * in route code, not via RLS policies.
 * Returns null when SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
