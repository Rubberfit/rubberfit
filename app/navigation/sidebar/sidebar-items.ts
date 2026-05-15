import {
  Package,
  Scissors,
  History,
  FileText,
  Database,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  BarChart3,
  ShieldCheck,
  ClipboardList,
  Users,
} from "lucide-react"
import type { Permission } from "@/src/application/permissions"

export interface NavSubItem {
  titleKey: string
  url: string
  icon?: LucideIcon
  comingSoon?: boolean
  newTab?: boolean
  isNew?: boolean
  requiredPermission?: Permission
}

export interface NavMainItem {
  titleKey: string
  url: string
  icon?: LucideIcon
  subItems?: NavSubItem[]
  comingSoon?: boolean
  newTab?: boolean
  requiredPermission?: Permission
  isNew?: boolean
}

export interface NavGroup {
  id: number
  labelKey?: string
  items: NavMainItem[]
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    labelKey: "groups.operations",
    items: [
      {
        titleKey: "items.dashboard.title",
        url: "/dashboard",
        icon: LayoutDashboard,
        // No permission required — all authenticated users see the dashboard
      },
      {
        titleKey: "items.inventory.title",
        url: "/dashboard/inventory",
        icon: Package,
        requiredPermission: "viewInventory",
        // Simplified to two sub-items. "Reorder Rules" was the third
        // entry; its logic now lives inside the Purchase Orders
        // surface (suggestion → PO one-click flow), so the separate
        // nav item was redundant. Route still exists for direct
        // links, just not promoted in the sidebar.
        subItems: [
          {
            titleKey: "items.inventory.subItems.currentStock",
            url: "/dashboard/inventory",
          },
          {
            titleKey: "items.inventory.subItems.purchaseOrders",
            url: "/dashboard/inventory/purchase-orders",
            requiredPermission: "manageRolls",
          },
        ],
      },
      {
        titleKey: "items.jobs.title",
        url: "/dashboard/jobs",
        icon: ClipboardList,
      },
      {
        titleKey: "items.cuttingEngine.title",
        url: "/dashboard/cutting-engine",
        icon: Scissors,
        requiredPermission: "accessCutPlanner",
        subItems: [
          {
            titleKey: "items.cuttingEngine.subItems.autoNest",
            url: "/dashboard/cutting-engine",
          },
          {
            titleKey: "items.cuttingEngine.subItems.freeRoam",
            url: "/dashboard/cutting-engine/free-roam",
          },
        ],
      },
      {
        titleKey: "items.cutHistory.title",
        url: "/dashboard/history",
        icon: History,
        requiredPermission: "viewCutHistory",
      },
    ],
  },
  {
    id: 2,
    labelKey: "groups.analytics",
    items: [
      {
        titleKey: "items.analytics.title",
        url: "/dashboard/analytics/waste",
        icon: BarChart3,
        requiredPermission: "accessAnalytics",
        subItems: [
          {
            titleKey: "items.analytics.subItems.waste",
            url: "/dashboard/analytics/waste",
            requiredPermission: "viewCurrentAnalysis",
          },
          {
            titleKey: "items.analytics.subItems.periodComparison",
            url: "/dashboard/analytics/waste-comparison",
            requiredPermission: "viewPeriodConsumption",
          },
          {
            titleKey: "items.analytics.subItems.materialUsage",
            url: "/dashboard/analytics/usage",
            requiredPermission: "viewMaterialUsage",
          },
          {
            titleKey: "items.analytics.subItems.costReports",
            url: "/dashboard/analytics/costs",
            requiredPermission: "viewCostReports",
          },
          {
            titleKey: "items.analytics.subItems.trends",
            url: "/dashboard/analytics/trends",
            requiredPermission: "viewTrends",
          },
        ],
      },
    ],
  },
  {
    id: 3,
    labelKey: "groups.management",
    items: [
      {
        titleKey: "items.materials.title",
        url: "/dashboard/inventory/materials",
        icon: Database,
        requiredPermission: "accessManagement",
        subItems: [
          {
            titleKey: "items.materials.subItems.materialSettings",
            url: "/dashboard/settings/materials",
            requiredPermission: "manageMaterialTypes",
          },
          {
            titleKey: "items.materials.subItems.materialTypes",
            url: "/dashboard/inventory/materials/types",
            requiredPermission: "manageMaterialTypes",
          },
          {
            titleKey: "items.materials.subItems.suppliers",
            url: "/dashboard/inventory/materials/suppliers",
            requiredPermission: "manageSuppliers",
          },
          {
            titleKey: "items.materials.subItems.pricing",
            url: "/dashboard/inventory/materials/pricing",
            requiredPermission: "managePricing",
          },
        ],
      },
      {
        titleKey: "items.reports.title",
        url: "/dashboard/analytics/reports",
        icon: FileText,
        requiredPermission: "viewReports",
      },
      {
        titleKey: "items.users.title",
        url: "/dashboard/users",
        icon: Users,
        requiredPermission: "manageUsers",
      },
      {
        // Phase 2 PR 5 admin-only Security & Audit page.
        // Distinct from the customer-facing /dashboard/security page in
        // group 4, which stays ungated for procurement reviewers.
        titleKey: "items.securityAudit.title",
        url: "/dashboard/admin/security",
        icon: ShieldCheck,
        requiredPermission: "manageUsers",
      },
      {
        titleKey: "items.settings.title",
        url: "/dashboard/settings/general",
        icon: Settings,
        requiredPermission: "manageUsers",
        subItems: [
          {
            titleKey: "items.settings.subItems.general",
            url: "/dashboard/settings/general",
            requiredPermission: "manageUsers",
          },
          {
            titleKey: "items.settings.subItems.profile",
            url: "/dashboard/settings/profile",
          },
          {
            titleKey: "items.settings.subItems.materials",
            url: "/dashboard/settings/materials",
            requiredPermission: "manageMaterialTypes",
          },
          {
            titleKey: "items.settings.subItems.notifications",
            url: "/dashboard/settings/notifications",
          },
          {
            titleKey: "items.settings.subItems.team",
            url: "/dashboard/settings/team",
          },
          {
            titleKey: "items.settings.subItems.billing",
            url: "/dashboard/settings/billing",
            requiredPermission: "manageUsers",
          },
        ],
      },
    ],
  },
  {
    id: 4,
    labelKey: "groups.qa",
    items: [
      {
        // Intentionally ungated — IT / procurement reviewers invited as
        // viewers should be able to read the Trust & Security surface
        // directly without being handed an elevated account.
        titleKey: "items.security.title",
        url: "/dashboard/security",
        icon: ShieldCheck,
      },
    ],
  },
]
