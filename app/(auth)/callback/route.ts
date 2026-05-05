import { type NextRequest, NextResponse } from "next/server"

import { createServerClient } from "@supabase/ssr"

import { resolvePostAuthRedirect, sanitizeRedirectPath } from "@/app/lib/auth-redirect"
import { type AppRole, DEFAULT_ROLES } from "@/src/application/permissions"

type PendingCookie = {
  name: string
  value: string
  options?: Parameters<NextResponse["cookies"]["set"]>[2]
}

function redirectWithCookies(
  requestUrl: URL,
  pathname: string,
  pendingCookies: PendingCookie[],
  searchParams?: URLSearchParams
) {
  const redirectUrl = new URL(pathname, requestUrl.origin)

  if (searchParams) {
    redirectUrl.search = searchParams.toString()
  }

  const response = NextResponse.redirect(redirectUrl)

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options)
  }

  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const requestedPath = sanitizeRedirectPath(requestUrl.searchParams.get("next"))
  const pendingCookies: PendingCookie[] = []
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    const loginParams = new URLSearchParams()
    loginParams.set("error", "Supabase environment variables are missing.")

    if (requestedPath) {
      loginParams.set("redirectTo", requestedPath)
    }

    return redirectWithCookies(requestUrl, "/login", pendingCookies, loginParams)
  }

  if (!code) {
    const loginParams = new URLSearchParams()
    loginParams.set("error", "Missing Google authentication code.")

    if (requestedPath) {
      loginParams.set("redirectTo", requestedPath)
    }

    return redirectWithCookies(requestUrl, "/login", pendingCookies, loginParams)
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        pendingCookies.length = 0
        pendingCookies.push(...cookiesToSet)

        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error("oauth callback error:", error)
    const loginParams = new URLSearchParams()
    loginParams.set("error", "Authentication failed. Please try again.")

    if (requestedPath) {
      loginParams.set("redirectTo", requestedPath)
    }

    return redirectWithCookies(requestUrl, "/login", pendingCookies, loginParams)
  }

  let roles: AppRole[] = [...DEFAULT_ROLES]

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("roles, is_deleted")
      .eq("id", user.id)
      .maybeSingle()

    if (profile?.is_deleted) {
      await supabase.auth.signOut()
      const loginParams = new URLSearchParams()
      loginParams.set(
        "error",
        "This account has been deactivated. Please contact your administrator."
      )
      return redirectWithCookies(requestUrl, "/login", pendingCookies, loginParams)
    }

    roles = (profile?.roles ?? [...DEFAULT_ROLES]) as AppRole[]

    // MFA enforcement for OAuth: the email+password login form
    // challenges inline, but OAuth hands us a fresh session with no
    // mid-flow prompt opportunity. Check assurance-level server-side
    // and reroute aal1 sessions through the dedicated challenge page.
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") {
        const finalTarget = resolvePostAuthRedirect(roles, requestedPath)
        const challengeParams = new URLSearchParams()
        challengeParams.set("redirectTo", finalTarget)
        return redirectWithCookies(
          requestUrl,
          "/mfa-challenge",
          pendingCookies,
          challengeParams
        )
      }
    } catch (err) {
      // MFA probe failure on the server is non-fatal — a password-
      // alone session is strictly weaker than enforced aal2, but
      // blocking an unenrolled user would be worse.
      console.error("[callback] MFA probe failed:", err)
    }
  }

  return redirectWithCookies(
    requestUrl,
    resolvePostAuthRedirect(roles, requestedPath),
    pendingCookies
  )
}
