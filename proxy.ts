import { createServerClient } from "@supabase/ssr"
import type { CookieOptions } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { NextRequest } from "next/server"
import { DEFAULT_ROLES, type AppRole } from "@/src/application/permissions"
import {
  getRequiredPermission,
  hasPermission,
} from "@/src/infrastructure/services/permissionService"
import type { Session } from "@supabase/supabase-js"

const ADMIN_EMAIL_DOMAIN = "@archandanchor.com"

interface ProfileRow {
  super_admin: boolean | null
}
 
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

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth")
  ) {
    const response = NextResponse.next()
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }

  const response = NextResponse.next({ request })
  const pendingCookies: Array<{ name: string; value: string; options?: CookieOptions }> = []

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
    loginUrl.searchParams.set("redirectTo", pathname)
    return redirectWithCookies(loginUrl, pendingCookies)
  }
 
  const requiredPermission = getRequiredPermission(pathname)

  if (requiredPermission) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("roles")
      .eq("id", user.id)
      .single()

    const userRoles = (profile?.roles ?? [...DEFAULT_ROLES]) as AppRole[]

    if (!hasPermission(userRoles, requiredPermission)) {
      return redirectWithCookies(new URL("/unauthorized", request.url), pendingCookies)
    }
  }
  if(pathname.startsWith("/admin") && !user.email?.endsWith(ADMIN_EMAIL_DOMAIN)) {
    return redirectWithCookies(new URL("/dashboard", request.url), pendingCookies)
  }

  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
}
