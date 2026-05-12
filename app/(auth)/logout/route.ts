import { type NextRequest, NextResponse } from "next/server"

import { createServerClient } from "@supabase/ssr"

type PendingCookie = {
  name: string
  value: string
  options?: Parameters<NextResponse["cookies"]["set"]>[2]
}

/**
 * GET /logout — signs the caller out of Supabase and bounces to /login.
 *
 * Used by the subscription lock screen's tertiary action so a blocked
 * user can always exit. Kept on the `(auth)` route group so cookie
 * scope matches the rest of the auth surface. Exempted from the
 * subscription gate in `proxy.ts` so a `blocked` user can reach it.
 */
async function handleLogout(request: NextRequest): Promise<NextResponse> {
  const pendingCookies: PendingCookie[] = []
  const response = NextResponse.redirect(new URL("/login", request.url))

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    // Env misconfiguration — still redirect. The proxy guards the rest.
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        pendingCookies.length = 0
        pendingCookies.push(...cookiesToSet)
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  try {
    await supabase.auth.signOut()
  } catch (_err) {
    // Redirect still bounces them out even if signOut errors.
  }

  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleLogout(request)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleLogout(request)
}
