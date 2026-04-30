import { createServerClient } from "@supabase/ssr"
import type { CookieOptions } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { NextRequest } from "next/server"
import { DEFAULT_ROLES, type AppRole } from "@/src/application/permissions"
import {
  getRequiredPermission,
  hasPermission,
} from "@/src/infrastructure/services/permissionService"
import { getProfileAccess } from "@/src/infrastructure/services/authService"

function redirectWithCookies(
  url: URL,
  pendingCookies: Array<{ name: string; value: string; options?: CookieOptions }>
) {
  const response = NextResponse.redirect(url)

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options)
  }

  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Let auth flows through unauthenticated. Otherwise the cookie work
  // below races with login/signup, which can bounce the user around.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth")
  ) {
    const res = NextResponse.next()
    res.headers.set("Cache-Control", "private, no-store")
    return res
  }

  const response = NextResponse.next({ request })
  const pendingCookies: Array<{ name: string; value: string; options?: CookieOptions }> = []

  // Cookie-bound client construction is unavoidable here — Next.js
  // middleware sees the request/response cookie pair only via this
  // factory. All non-auth `.from(...)` lookups go through `authService`
  // so this file owns nothing but session hydration.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          pendingCookies.length = 0
          pendingCookies.push(...cookiesToSet)

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL("/login", request.url)
    // Preserve the full destination including query params so flows
    // like `/dashboard/inventory?scan=RF-000001` survive the login
    // round-trip (scanned QR label → login → drawer auto-opens).
    const target = request.nextUrl.search ? `${pathname}${request.nextUrl.search}` : pathname
    loginUrl.searchParams.set("redirectTo", target)
    return redirectWithCookies(loginUrl, pendingCookies)
  }

  const requiredPermission = getRequiredPermission(pathname)
  const needsAdmin = pathname.startsWith("/admin")

  if (requiredPermission || needsAdmin) {
    let access
    try {
      access = await getProfileAccess(supabase, user.id)
    } catch (_err) {
      // Treat profile-load failures as denials rather than letting
      // requests through unauthenticated.
      return redirectWithCookies(new URL("/unauthorized", request.url), pendingCookies)
    }

    if (requiredPermission) {
      const userRoles = access.roles.length > 0 ? (access.roles as AppRole[]) : [...DEFAULT_ROLES]
      if (!hasPermission(userRoles, requiredPermission)) {
        return redirectWithCookies(new URL("/unauthorized", request.url), pendingCookies)
      }
    }

    if (needsAdmin && !access.isSuperAdmin) {
      return redirectWithCookies(new URL("/dashboard", request.url), pendingCookies)
    }
  }

  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
}
