import {
  Package,
  Scissors,
  History,
  AlertTriangle,
  FileText,
  Database,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  TrendingUp,
  BarChart3,
  DollarSign,
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
        url: "/dashboard/default",
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
        title: "Cut Planner",
        url: "/dashboard/cut-planner",
        icon: Scissors,
        requiredPermission: "accessCutPlanner",
        subItems: [
          {
            title: "Single Cut",
            url: "/dashboard/cut-planner",
            requiredPermission: "createCut",
          },
          {
            title: "Batch Cuts",
            url: "/dashboard/cut-planner/batch",
            requiredPermission: "accessBatchCut",
            isNew: true,
          },
          {
            title: "Manual Selection",
            url: "/dashboard/cut-planner/manual",
            requiredPermission: "createCut",
            isNew: true,
          },
          {
            title: "History",
            url: "/dashboard/cut-planner/history",
            requiredPermission: "viewCutHistory",
          },
        ],
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
        title: "Waste Analysis",
        url: "/dashboard/waste",
        icon: AlertTriangle,
        requiredPermission: "accessAnalytics",
        subItems: [
          {
            title: "Current Analysis",
            url: "/dashboard/waste",
            requiredPermission: "viewCurrentAnalysis",
          },
          {
            title: "Period Comparison",
            url: "/dashboard/waste-comparison",
            requiredPermission: "viewPeriodConsumption",
            isNew: true,
          },
        ],
      },
      {
        title: "Material Usage",
        url: "/dashboard/usage",
        icon: BarChart3,
        requiredPermission: "viewMaterialUsage",
      },
      {
        title: "Cost Reports",
        url: "/dashboard/costs",
        icon: DollarSign,
        requiredPermission: "viewCostReports",
      },
      {
        title: "Trends",
        url: "/dashboard/trends",
        icon: TrendingUp,
        requiredPermission: "viewTrends",
      },
    ],
  },
  {
    id: 3,
    label: "Management",
    items: [
      {
        title: "Materials",
        url: "/dashboard/materials",
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
            url: "/dashboard/materials/types",
            requiredPermission: "manageMaterialTypes",
          },
          {
            title: "Suppliers",
            url: "/dashboard/materials/suppliers",
            requiredPermission: "manageSuppliers",
          },
          {
            title: "Pricing",
            url: "/dashboard/materials/pricing",
            requiredPermission: "managePricing",
          },
        ],
      },
      {
        title: "Reports",
        url: "/dashboard/reports",
        icon: FileText,
        requiredPermission: "viewReports",
      },
      {
        title: "Settings",
        url: "/dashboard/settings",
        icon: Settings,
        requiredPermission: "manageUsers",
      },
    ],
  },
]
