import { Permission, PERMISSIONS, AppRole, ROUTE_PERMISSIONS } from "@/src/application/permissions"

export function hasAnyRole(userRoles: readonly AppRole[], requiredRoles: readonly AppRole[]) {
  return requiredRoles.some((role) => userRoles.includes(role))
}

export function hasPermission(userRoles: readonly AppRole[], permission: Permission) {
  return hasAnyRole(userRoles, PERMISSIONS[permission])
}

export function getRequiredPermission(pathname: string): Permission | null {
  if (pathname in ROUTE_PERMISSIONS) {
    return ROUTE_PERMISSIONS[pathname as keyof typeof ROUTE_PERMISSIONS]
  }

  const matchedKey = Object.keys(ROUTE_PERMISSIONS)
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname.startsWith(route))

  return matchedKey ? ROUTE_PERMISSIONS[matchedKey as keyof typeof ROUTE_PERMISSIONS] : null
}
