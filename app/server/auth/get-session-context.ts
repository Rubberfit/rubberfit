import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import { AuthConfigError } from "./errors"

/**
 * Soft session lookup used by the public `/invite/[token]` landing
 * page. Unlike `requireAuthenticatedUser`, this does NOT throw on a
 * missing session — it just returns `{ kind: "anonymous" }`.
 */
export type SessionContext =
  | { kind: "anonymous" }
  | { kind: "authenticated"; userId: string; email: string }

export async function getSessionContext(): Promise<SessionContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new AuthConfigError()

  const cookieStore = await cookies()
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  })

  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user || !user.email) return { kind: "anonymous" }

  return { kind: "authenticated", userId: user.id, email: user.email }
}
