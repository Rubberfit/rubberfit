<<<<<<<< HEAD:src/application/auth-redirect.ts
import { canAccessPath, getDefaultAuthorizedPath } from "@/src/application/rbac"
========
import { canAccessPath, getDefaultAuthorizedPath } from "@/app/lib/rbac"
>>>>>>>> 5b86d9b (Restructured file structure to utilize the clean architecture, installed TSyringe and implemented an AGENTS.md file for Codex.):app/lib/auth-redirect.ts

export function sanitizeRedirectPath(pathname?: string | null): string | null {
  if (!pathname) return null

  if (!pathname.startsWith("/") || pathname.startsWith("//")) return null

  if (pathname.startsWith("/auth")) return null

  if (pathname !== "/dashboard" && !pathname.startsWith("/dashboard/")) return null

  return pathname
}

export function resolvePostAuthRedirect(
  roles?: string[] | null,
  requestedPath?: string | null
): string {
  const safePath = sanitizeRedirectPath(requestedPath)

  if (safePath && canAccessPath(roles, safePath)) return safePath

  return getDefaultAuthorizedPath(roles)
}
