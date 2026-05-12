import { supabase } from "@/src/infrastructure/models/supabase"

/**
 * @deprecated For client-bound paths only. Server-action callers must
 * resolve the actor via `requireAuthenticatedUser()` from
 * `@/app/server/auth/require-authenticated-user` and pass `actor.id`
 * explicitly to services and use-cases.
 *
 * This helper reads from the BROWSER Supabase singleton, which has no
 * session in a Node runtime — calling it from a server action will
 * throw "Not authenticated" even when the caller is signed in. Kept
 * for legacy callers (browser-side hooks, the cuts API route, and
 * `record-cut.use-case`) until those migrate to per-route auth.
 */
export async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error("Not authenticated")
  }

  return user.id
}
