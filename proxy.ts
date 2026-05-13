/**
 * Next.js proxy (formerly `middleware.ts` — renamed in Next.js 16).
 *
 * Three responsibilities, executed in order on every matched request:
 *
 *   1. Refresh the Supabase SSR session cookie if needed.
 *   2. Enforce the auth allowlist — unauthenticated requests to any
 *      non-public path get a 302 redirect to /login (HTML pages) or a
 *      401 JSON response (API routes).
 *   3. Apply role / super-admin gating for /dashboard and /admin paths.
 *   4. Attach security response headers (CSP-Report-Only, HSTS, etc.).
 *
 * Out of scope for this layer (see security-decisions.md → "Middleware
 * architecture" for the full decision table):
 *   - Per-row authorization. RLS at the DB layer + per-route ownership
 *     filtering own that.
 *   - Rate limiting. Tracked in ARC-142.
 *   - Structured request logging. Tracked in Phase B / V16.
 *
 * The `createServerClient` call must live in this file (not be extracted
 * into `src/infrastructure/`) because the Supabase cookie adapter binds
 * tightly to NextRequest/NextResponse. This is the documented exception
 * in tests/architecture/no-direct-supabase.test.ts.
 */
import { createServerClient } from "@supabase/ssr"
import type { CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { DEFAULT_ROLES, type AppRole } from "@/src/application/permissions"
import { getProfileAccess } from "@/src/infrastructure/services/authService"
import {
  getRequiredPermission,
  hasPermission,
} from "@/src/infrastructure/services/permissionService"
import { isApiPath, isPublicPath } from "@/src/middleware/auth-allowlist"
import { applySecurityHeaders } from "@/src/middleware/security-headers"

type PendingCookie = { name: string; value: string; options?: CookieOptions }

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return applySecurityHeaders(privateResponse(NextResponse.next()))
  }

  const response = NextResponse.next({ request })
  const pendingCookies: PendingCookie[] = []

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    // Env misconfiguration — fail closed by treating every request as
    // unauthenticated. The deploy is broken in this state, but no
    // request is ever served as authenticated under bad config.
    return applySecurityHeaders(buildUnauthenticatedResponse(request, pendingCookies))
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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

  // Per Supabase SSR docs: do not insert any logic between
  // createServerClient and getUser. Code in between can cause
  // hard-to-debug session bugs where users get randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return applySecurityHeaders(buildUnauthenticatedResponse(request, pendingCookies))
  }

  // Per-path role + super-admin gating. These checks only fire for
  // pathnames that have a permission entry or live under /admin —
  // everything else passes once authenticated.
  //
  // The accessibility check (`access.isInaccessible`) ALSO only fires
  // here. Closing the gap fully (catching deactivated users on any
  // authenticated path, including dashboard root and /api/*) would
  // require loading the profile + membership count on every
  // authenticated request — one extra DB round-trip per request,
  // meaningful at scale. The remaining gap is "user whose last
  // membership was soft-deleted can hit unguarded paths until their
  // cookie expires"; the fully durable fix is refresh-token revocation
  // on membership removal, tracked separately.
  const requiredPermission = getRequiredPermission(pathname)
  const needsAdmin = pathname.startsWith("/admin")

  if (requiredPermission || needsAdmin) {
    let access
    try {
      access = await getProfileAccess(supabase, user.id)
    } catch (_err) {
      // Treat profile-load failures as denials rather than letting
      // requests through with no role information.
      return applySecurityHeaders(
        redirectWithCookies(new URL("/unauthorized", request.url), pendingCookies)
      )
    }

    // Inaccessible account (no profile row, or zero active memberships
    // and not a platform admin) — sign them out and bounce back to
    // login. signOut() goes through the cookies adapter wired above,
    // which appends cookie-clearing instructions to `pendingCookies`;
    // those flow into the redirect response.
    if (access.isInaccessible) {
      try {
        await supabase.auth.signOut()
      } catch (_err) {
        // Even if signOut fails, the redirect still bounces them out.
      }
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("deactivated", "1")
      return applySecurityHeaders(redirectWithCookies(loginUrl, pendingCookies))
    }

    if (requiredPermission) {
      const userRoles = access.roles.length > 0 ? (access.roles as AppRole[]) : [...DEFAULT_ROLES]
      if (!hasPermission(userRoles, requiredPermission)) {
        return applySecurityHeaders(
          redirectWithCookies(new URL("/unauthorized", request.url), pendingCookies)
        )
      }
    }

    if (needsAdmin && !access.isSuperAdmin) {
      return applySecurityHeaders(
        redirectWithCookies(new URL("/dashboard", request.url), pendingCookies)
      )
    }
  }

  return applySecurityHeaders(privateResponse(response))
}

function privateResponse(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

function buildUnauthenticatedResponse(
  request: NextRequest,
  pendingCookies: PendingCookie[]
): NextResponse {
  const { pathname, search } = request.nextUrl

  if (isApiPath(pathname)) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options)
    }
    return privateResponse(response)
  }

  const loginUrl = new URL("/login", request.url)
  // Preserve the full destination including query params so flows
  // like `/dashboard/inventory?scan=RF-000001` survive the login
  // round-trip (scanned QR label → login → drawer auto-opens).
  // Suppress the redirectTo query string for the bare root `/`: the
  // post-login landing page already redirects unauthenticated traffic
  // back to /dashboard, so carrying `redirectTo=%2F` adds visible URL
  // noise on every first visit without changing the destination.
  if (pathname !== "/" || search) {
    const target = search ? `${pathname}${search}` : pathname
    loginUrl.searchParams.set("redirectTo", target)
  }
  return redirectWithCookies(loginUrl, pendingCookies)
}

function redirectWithCookies(url: URL, pendingCookies: PendingCookie[]): NextResponse {
  const response = NextResponse.redirect(url)
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options)
  }
  return privateResponse(response)
}

export const config = {
  /*
   * Default-deny matcher: every request flows through the proxy, then
   * the auth allowlist inside decides which paths bypass auth. The
   * exclusions below cover static assets and the Vercel Rust function
   * at `api/v2/pack.rs` — the proxy is a Next.js Edge Middleware and
   * its `NextResponse.next()` resolves within the Next.js routing
   * pipeline, so it would shadow the top-level Rust function and
   * Next.js would render a `__next_error__` page for the now-missing
   * route. The Rust handler validates the Supabase JWT itself, so
   * bypassing the proxy here does not weaken auth.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/v2/pack|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
