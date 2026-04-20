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
} from "lucide-react"
import type { Permission } from "@/src/application/permissions"

export interface NavSubItem {
  title: string
  url: string
  icon?: LucideIcon
  comingSoon?: boolean
  newTab?: boolean
  isNew?: boolean
  requiredPermission?: Permission
}

export interface NavMainItem {
  title: string
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
  label?: string
  items: NavMainItem[]
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Operations",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
        // No permission required — all authenticated users see the dashboard
      },
      {
        title: "Inventory",
        url: "/dashboard/inventory",
        icon: Package,
        requiredPermission: "viewInventory",
        subItems: [
          {
            title: "Current Stock",
            url: "/dashboard/inventory",
          },
          {
            title: "Reorder Rules",
            url: "/dashboard/inventory/reorder",
            requiredPermission: "manageRolls",
          },
          {
            title: "Purchase Orders",
            url: "/dashboard/inventory/purchase-orders",
            requiredPermission: "manageRolls",
          },
        ],
      },
      {
        title: "Cutting Engine",
        url: "/dashboard/cutting-engine",
        icon: Scissors,
        requiredPermission: "accessCutPlanner",
      },
      {
        title: "Cut History",
        url: "/dashboard/history",
        icon: History,
        requiredPermission: "viewCutHistory",
      },
    ],
  },
  {
    id: 2,
    label: "Analytics",
    items: [
      {
        title: "Analytics",
        url: "/dashboard/analytics/waste",
        icon: BarChart3,
        requiredPermission: "accessAnalytics",
        subItems: [
          {
            title: "Waste",
            url: "/dashboard/analytics/waste",
            requiredPermission: "viewCurrentAnalysis",
          },
          {
            title: "Period comparison",
            url: "/dashboard/analytics/waste-comparison",
            requiredPermission: "viewPeriodConsumption",
          },
          {
            title: "Material usage",
            url: "/dashboard/analytics/usage",
            requiredPermission: "viewMaterialUsage",
          },
          {
            title: "Cost reports",
            url: "/dashboard/analytics/costs",
            requiredPermission: "viewCostReports",
          },
          {
            title: "Trends",
            url: "/dashboard/analytics/trends",
            requiredPermission: "viewTrends",
          },
        ],
      },
    ],
  },
  {
    id: 3,
    label: "Management",
    items: [
      {
        title: "Materials",
        url: "/dashboard/inventory/materials",
        icon: Database,
        requiredPermission: "accessManagement",
        subItems: [
          {
            title: "Material Settings",
            url: "/dashboard/settings/materials",
            requiredPermission: "manageMaterialTypes",
          },
          {
            title: "Material Types",
            url: "/dashboard/inventory/materials/types",
            requiredPermission: "manageMaterialTypes",
          },
          {
            title: "Suppliers",
            url: "/dashboard/inventory/materials/suppliers",
            requiredPermission: "manageSuppliers",
          },
          {
            title: "Pricing",
            url: "/dashboard/inventory/materials/pricing",
            requiredPermission: "managePricing",
          },
        ],
      },
      {
        title: "Reports",
        url: "/dashboard/analytics/reports",
        icon: FileText,
        requiredPermission: "viewReports",
      },
      {
        title: "Settings",
        url: "/dashboard/settings/general",
        icon: Settings,
        requiredPermission: "manageUsers",
        subItems: [
          {
            title: "General",
            url: "/dashboard/settings/general",
            requiredPermission: "manageUsers",
          },
          {
            title: "Profile & account",
            url: "/dashboard/settings/profile",
          },
          {
            title: "Materials",
            url: "/dashboard/settings/materials",
            requiredPermission: "manageMaterialTypes",
          },
          {
            title: "Notifications",
            url: "/dashboard/settings/notifications",
          },
        ],
      },
    ],
  },
]
