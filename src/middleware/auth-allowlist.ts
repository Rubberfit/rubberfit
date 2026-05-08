/**
 * Paths that bypass proxy authentication enforcement.
 *
 * Adding to this list is a security-relevant change and must be reviewed.
 * Each entry is either an auth-flow path (the user is mid-authentication
 * and has no session yet) or has an explicit reason documented inline.
 *
 * ASVS reference: V8.3 (page-level access control delegation), V13.2
 * (allowlist of public endpoints).
 */
export const PUBLIC_PATHS = [
  // Auth pages — user has no session yet by definition.
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/mfa-challenge",

  // OAuth code-exchange callback. Supabase finalizes the session here
  // before the user has a usable cookie.
  "/callback",

  // Image embedded in transactional emails. Must load without auth so
  // recipients see the brand image in their inbox.
  "/auth-email-logo",
] as const

/**
 * Returns true if `pathname` is on the public allowlist.
 *
 * Matches exact paths and sub-paths under each entry. So `/login` matches
 * `/login`, `/login/`, and `/login/anything` — but NOT `/loginadmin`.
 */
export function isPublicPath(pathname: string): boolean {
  for (const publicPath of PUBLIC_PATHS) {
    if (pathname === publicPath) return true
    if (pathname.startsWith(`${publicPath}/`)) return true
  }
  return false
}

/**
 * Returns true if `pathname` is an API route. Used to choose between a
 * 401 JSON response (API) and a 302 redirect to /login (page).
 */
export function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/")
}
