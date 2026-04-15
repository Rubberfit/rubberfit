import { DEFAULT_ROLES, type AppRole } from "@/src/application/permissions"
import {
  getRequiredPermission,
  hasPermission,
} from "@/src/infrastructure/services/permissionService"

const ELEVATED_ROLES = new Set<AppRole>(["admin", "manager", "supervisor"])

const CUTTER_ALLOWED_EXACT_PATHS = new Set([
  "/dashboard/cut-planner",
  "/dashboard/cut-planner/batch",
  "/dashboard/cut-planner/manual",
  "/dashboard/inventory",
  "/dashboard/history",
  "/dashboard/account",
  "/dashboard/notifications",
])

const CUTTER_ALLOWED_PREFIXES = ["/dashboard/cut-planner/"]

export function normalizeRoles(roles?: string[] | null): AppRole[] {
  if (!Array.isArray(roles) || roles.length === 0) {
    return [...DEFAULT_ROLES]
  }

  return roles.filter(Boolean).map((role) => role.toLowerCase() as AppRole)
}

export function isRestrictedCutter(roles?: string[] | null): boolean {
  const normalizedRoles = normalizeRoles(roles)

  return (
    normalizedRoles.includes("cutter") && !normalizedRoles.some((role) => ELEVATED_ROLES.has(role))
  )
}

export function getDefaultAuthorizedPath(roles?: string[] | null): string {
  return isRestrictedCutter(roles) ? "/dashboard/cut-planner" : "/dashboard/default"
}

export function canAccessPath(roles: string[] | null | undefined, pathname: string): boolean {
  const normalizedRoles = normalizeRoles(roles)

  if (isRestrictedCutter(normalizedRoles)) {
    if (CUTTER_ALLOWED_EXACT_PATHS.has(pathname)) return true
    if (CUTTER_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true
    return false
  }

  const permission = getRequiredPermission(pathname)
  if (!permission) return true

  return hasPermission(normalizedRoles, permission)
}
