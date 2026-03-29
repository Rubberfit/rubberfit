import type { NavGroup, NavMainItem, NavSubItem } from "@/navigation/sidebar/sidebar-items";

export type AppRole = "admin" | "manager" | "supervisor" | "cutter" | "member";

const ELEVATED_ROLES = new Set<AppRole>(["admin", "manager", "supervisor"]);
const CUTTER_ALLOWED_EXACT_PATHS = new Set([
  "/dashboard/cut-planner",
  "/dashboard/cut-planner/batch",
  "/dashboard/cut-planner/manual",
  "/dashboard/inventory",
  "/dashboard/account",
  "/dashboard/notifications",
]);
const CUTTER_ALLOWED_PREFIXES = ["/dashboard/cut-planner/"];

export function normalizeRoles(roles?: string[] | null): AppRole[] {
  if (!Array.isArray(roles) || roles.length === 0) {
    return ["member"];
  }

  return roles.filter(Boolean).map((role) => role.toLowerCase() as AppRole);
}

export function isRestrictedCutter(roles?: string[] | null): boolean {
  const normalizedRoles = normalizeRoles(roles);

  return normalizedRoles.includes("cutter") && !normalizedRoles.some((role) => ELEVATED_ROLES.has(role));
}

export function getDefaultAuthorizedPath(roles?: string[] | null): string {
  return isRestrictedCutter(roles) ? "/dashboard/cut-planner" : "/dashboard/default";
}

export function canAccessPath(roles: string[] | null | undefined, pathname: string): boolean {
  if (!isRestrictedCutter(roles)) {
    return true;
  }

  if (CUTTER_ALLOWED_EXACT_PATHS.has(pathname)) {
    return true;
  }

  return CUTTER_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function filterSubItems(subItems: NavSubItem[] | undefined, roles: string[] | null | undefined) {
  return (subItems ?? []).filter((subItem) => canAccessPath(roles, subItem.url));
}

function filterMainItem(item: NavMainItem, roles: string[] | null | undefined): NavMainItem | null {
  const visibleSubItems = filterSubItems(item.subItems, roles);
  const itemIsVisible = canAccessPath(roles, item.url);

  if (!itemIsVisible && visibleSubItems.length === 0) {
    return null;
  }

  return {
    ...item,
    subItems: visibleSubItems.length > 0 ? visibleSubItems : undefined,
  };
}

export function filterNavGroupsForRoles(groups: NavGroup[], roles: string[] | null | undefined): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => filterMainItem(item, roles))
        .filter((item): item is NavMainItem => item !== null),
    }))
    .filter((group) => group.items.length > 0);
}
