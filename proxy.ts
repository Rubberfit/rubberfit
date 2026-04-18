import { createServerClient } from "@supabase/ssr"
import type { CookieOptions } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { DEFAULT_ROLES, type AppRole } from "@/src/application/permissions"
import {
  getRequiredPermission,
  hasPermission,
} from "@/src/infrastructure/services/permissionService"

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

  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export const config = {
  matcher: ["/dashboard/:path*"],
}
