import { canAccessPath, getDefaultAuthorizedPath } from "./rbac"

export function sanitizeRedirectPath(pathname?: string | null): string | null {
  if (!pathname) {
    return null
  }

  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return null
  }

  if (pathname.startsWith("/auth")) {
    return null
  }

  if (pathname !== "/dashboard" && !pathname.startsWith("/dashboard/")) {
    return null
  }

  return pathname
}

export function resolvePostAuthRedirect(
  roles?: string[] | null,
  requestedPath?: string | null
): string {
  const safePath = sanitizeRedirectPath(requestedPath)

  if (safePath && canAccessPath(roles, safePath)) {
    return safePath
  }

  return getDefaultAuthorizedPath(roles)
}
