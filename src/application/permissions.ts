export type AppRole = "admin" | "cutter" | "manager" | "member" | "supervisor" | "viewer"

export const DEFAULT_ROLES = ["member"] as const satisfies readonly AppRole[]

export const ALL_ROLES = [
  "admin",
  "cutter",
  "manager",
  "member",
  "supervisor",
  "viewer",
] as const satisfies readonly AppRole[]

export const PERMISSIONS = {
  // Inventory
  viewInventory: ["admin", "manager", "supervisor", "cutter", "member", "viewer"],
  manageRolls: ["admin", "manager"],
  // 7c-2 admin reconciliation surface — covers both pending_apply and
  // pending_roll_creation views. Admin-only because a misapplied reconcile
  // can double-count inventory or stamp the wrong row.
  reconcileReceipts: ["admin"],

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
} as const satisfies Record<string, readonly AppRole[]>

export type Permission = keyof typeof PERMISSIONS

export const ROUTE_PERMISSIONS = {
  // Cutting Engine (renamed from Cut Planner in S4 Task 8)
  "/dashboard/cutting-engine": "accessCutPlanner",
  "/dashboard/cutting-engine/history": "viewCutHistory",

  // History
  "/dashboard/history": "viewCutHistory",

  // Analytics — consolidated under /dashboard/analytics/* in S4 Task 9.
  "/dashboard/analytics/waste": "accessAnalytics",
  "/dashboard/analytics/waste-comparison": "viewPeriodConsumption",
  "/dashboard/analytics/usage": "viewMaterialUsage",
  "/dashboard/analytics/costs": "viewCostReports",
  "/dashboard/analytics/trends": "viewTrends",
  "/dashboard/analytics/reports": "viewReports",

  // Inventory sub-routes
  "/dashboard/inventory/reorder": "manageRolls",
  "/dashboard/inventory/purchase-orders": "manageRolls",
  // 7c-2 admin reconciliation dashboard — consumes the two views that
  // surface partial-state windows in the receive-PO flow.
  "/dashboard/admin/inventory/po-reconciliation": "reconcileReceipts",

  // Management — materials live under inventory after S4 Task 3
  "/dashboard/inventory/materials": "accessManagement",
  "/dashboard/inventory/materials/types": "manageMaterialTypes",
  "/dashboard/inventory/materials/suppliers": "manageSuppliers",
  "/dashboard/inventory/materials/pricing": "managePricing",
  "/dashboard/settings/materials": "manageMaterialTypes",

  // Settings & Users (S4 Task 10 consolidation)
  "/dashboard/settings": "manageUsers",
  "/dashboard/settings/general": "manageUsers",

  // Admin surfaces (Phase 2 PR 5)
  "/dashboard/admin/security": "manageUsers",
} as const satisfies Record<string, Permission>
