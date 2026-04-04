export type AppRole = "admin" | "cutter" | "manager" | "member" | "supervisor" | "viewer";

export const DEFAULT_ROLES = ["member"] as const satisfies readonly AppRole[];

export const PERMISSIONS = {
  // Inventory
  viewInventory: ["admin", "manager", "supervisor", "cutter", "member", "viewer"],
  manageRolls: ["admin", "manager"],

  // Cut Planner
  accessCutPlanner: ["admin", "cutter"],
  createCut: ["admin", "cutter"],
  accessBatchCut: ["admin", "cutter"],
  approveCut: ["admin", "supervisor"],
  viewCutHistory: ["admin", "manager", "supervisor", "cutter"],

  // Management
  accessManagement: ["admin", "manager"],
  manageMaterialTypes: ["admin", "manager"],
  manageSuppliers: ["admin", "manager"],
  managePricing: ["admin"],
  manageUsers: ["admin"],

  // Analytics
  accessAnalytics: ["admin", "manager", "supervisor"],
  viewCurrentAnalysis: ["admin", "manager", "supervisor"],
  viewPeriodConsumption: ["admin", "manager"],
  viewMaterialUsage: ["admin", "manager", "supervisor"],
  viewCostReports: ["admin", "manager"],
  viewTrends: ["admin", "manager"],
  viewReports: ["admin", "manager", "supervisor"],
} as const satisfies Record<string, readonly AppRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export const ROUTE_PERMISSIONS = {
  // Cut Planner
  "/dashboard/cut-planner": "accessCutPlanner",
  "/dashboard/cut-planner/batch": "accessBatchCut",
  "/dashboard/cut-planner/manual": "createCut",

  // History
  "/dashboard/history": "viewCutHistory",

  // Analytics
  "/dashboard/waste": "accessAnalytics",
  "/dashboard/waste-comparison": "viewPeriodConsumption",
  "/dashboard/usage": "viewMaterialUsage",
  "/dashboard/costs": "viewCostReports",
  "/dashboard/trends": "viewTrends",
  "/dashboard/reports": "viewReports",

  // Inventory sub-routes
  "/dashboard/inventory/reorder": "manageRolls",
  "/dashboard/inventory/purchase-orders": "manageRolls",

  // Management
  "/dashboard/materials": "accessManagement",
  "/dashboard/materials/types": "manageMaterialTypes",
  "/dashboard/materials/suppliers": "manageSuppliers",
  "/dashboard/materials/pricing": "managePricing",
  "/dashboard/settings/materials": "manageMaterialTypes",

  // Settings & Users
  "/dashboard/settings": "manageUsers",
} as const satisfies Record<string, Permission>;

export function hasAnyRole(userRoles: readonly AppRole[], requiredRoles: readonly AppRole[]) {
  return requiredRoles.some((role) => userRoles.includes(role));
}

export function hasPermission(userRoles: readonly AppRole[], permission: Permission) {
  return hasAnyRole(userRoles, PERMISSIONS[permission]);
}

export function getRequiredPermission(pathname: string): Permission | null {
  if (pathname in ROUTE_PERMISSIONS) {
    return ROUTE_PERMISSIONS[pathname as keyof typeof ROUTE_PERMISSIONS];
  }

  const matchedKey = Object.keys(ROUTE_PERMISSIONS)
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname.startsWith(route));

  return matchedKey ? ROUTE_PERMISSIONS[matchedKey as keyof typeof ROUTE_PERMISSIONS] : null;
}
