import {
  Package,
  Scissors,
  History,
  ChartBar,
  AlertTriangle,
  Forklift,
  FileText,
  Database,
  LayoutDashboard,
  Calculator,
  type LucideIcon,
  Settings,
  TrendingUp,
  BarChart3,
  DollarSign,
  Users,
  ShoppingCart,
  RefreshCw,
} from "lucide-react";
import type { Permission } from "@/services/useRole";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  requiredPermission?: Permission;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
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
      },
      {
        title: "Inventory",
        url: "/dashboard/inventory",
        icon: Package,
        subItems: [
          { title: "Current Stock", url: "/dashboard/inventory" },
          { title: "Reorder Rules", url: "/dashboard/inventory/reorder" },
          { title: "Purchase Orders", url: "/dashboard/inventory/purchase-orders" },
        ],
      },
      {
        title: "Cut Planner",
        url: "/dashboard/cut-planner",
        icon: Scissors,
        requiredPermission: "accessCutPlanner",
        subItems: [
          { title: "Single Cut", url: "/dashboard/cut-planner" },
          { title: "Batch Cuts", url: "/dashboard/cut-planner/batch", isNew: true },
          { title: "Manual Selection", url: "/dashboard/cut-planner/manual", isNew: true },
        ],
      },
      {
        requiredPermission: "accessCutPlanner",
        title: "Cut History",
        url: "/dashboard/history",
        icon: History,
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
        subItems: [
          { title: "Current Analysis", url: "/dashboard/waste" },
          { title: "Period Comparison", url: "/dashboard/waste-comparison", isNew: true },
        ],
      },
      {
        title: "Material Usage",
        url: "/dashboard/usage",
        icon: BarChart3,
      },
      {
        title: "Cost Reports",
        url: "/dashboard/costs",
        icon: DollarSign,
      },
      {
        title: "Trends",
        url: "/dashboard/trends",
        icon: TrendingUp,
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
        subItems: [
          { title: "Material Settings", url: "/dashboard/settings/materials" },
          { title: "Material Types", url: "/dashboard/materials/types" },
          { title: "Suppliers", url: "/dashboard/materials/suppliers" },
          { title: "Pricing", url: "/dashboard/materials/pricing" },
        ],
      },
      {
        requiredPermission: "viewReports",
        title: "Reports",
        url: "/dashboard/reports",
        icon: FileText,
      },
      {
        title: "Settings",
        url: "/dashboard/settings",
        icon: Settings,
      },
    ],
  },
];
