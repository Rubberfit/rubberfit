export {
  normalizeRoles,
  isRestrictedCutter,
  canAccessPath,
  getDefaultAuthorizedPath,
} from "@/src/application/rbac"

import { canAccessPath, normalizeRoles } from "@/src/application/rbac"
import { hasPermission } from "@/src/infrastructure/services/permissionService"
import type { NavGroup, NavMainItem, NavSubItem } from "@/app/navigation/sidebar/sidebar-items"
import type { Permission } from "@/src/application/permissions"

function canSeePermission(roles: string[] | null | undefined, requiredPermission?: Permission) {
  if (!requiredPermission) {
    return true
  }

  return hasPermission(normalizeRoles(roles), requiredPermission)
}

function filterSubItems(subItems: NavSubItem[] | undefined, roles: string[] | null | undefined) {
  return (subItems ?? []).filter(
    (subItem) =>
      canSeePermission(roles, subItem.requiredPermission) && canAccessPath(roles, subItem.url)
  )
}

function filterMainItem(item: NavMainItem, roles: string[] | null | undefined): NavMainItem | null {
  const visibleSubItems = filterSubItems(item.subItems, roles)
  const itemIsVisible =
    canSeePermission(roles, item.requiredPermission) && canAccessPath(roles, item.url)

  if (!itemIsVisible && visibleSubItems.length === 0) {
    return null
  }

  return {
    ...item,
    subItems: visibleSubItems.length > 0 ? visibleSubItems : undefined,
  }
}

export function filterNavGroupsForRoles(
  groups: NavGroup[],
  roles: string[] | null | undefined
): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => filterMainItem(item, roles))
        .filter((item): item is NavMainItem => item !== null),
    }))
    .filter((group) => group.items.length > 0)
}
