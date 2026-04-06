# dashboard/

Main dashboard layout, navigation, and shared components. All authenticated pages live under this route.

## Files

- **layout.tsx** -- Server component: reads user preferences from cookies, renders ProtectedRoute wrapper, SidebarProvider, and the app sidebar shell
- **page.tsx** -- Redirects `/dashboard` to `/dashboard/default`

## \_components/

Shared components used across multiple dashboard pages.

- **inventory-table.tsx** -- Roll inventory data table with sorting, filtering, and inline actions
- **inventory-search.tsx** -- Search input with 300ms debounce for filtering inventory
- **roll-form-dialog.tsx** -- Dialog for adding/editing a roll (Zod-validated form)
- **roll-form-fields.tsx** -- Form fields shared by roll create/edit forms
- **csv-upload.tsx** -- Drag-and-drop CSV upload for bulk roll import
- **material-summary-chart.tsx** -- Recharts bar chart showing material type distribution
- **waste-trend-chart.tsx** -- Recharts line chart showing waste percentage over time

### \_components/sidebar/

- **app-sidebar.tsx** -- Main sidebar: RBAC-filtered nav items, role-based home link
- **account-switcher.tsx** -- Account/org switcher dropdown
- **account-switcher-wrapper.tsx** -- Fetches account data for the switcher
- **nav-main.tsx** -- Primary nav with expandable submenus, notification badge, quick create
- **nav-main-submenu.tsx** -- Expandable submenu items
- **nav-secondary.tsx** -- Secondary/bottom navigation links
- **nav-documents.tsx** -- Document-related nav section
- **nav-user.tsx** -- User profile menu in sidebar footer (account, notifications, logout)
- **search-dialog.tsx** -- Global search dialog (Cmd+J)
- **quick-create-form.tsx** -- Compact form for rapid roll creation from sidebar
- **theme-switcher.tsx** -- Theme mode toggle (light/dark/system)
- **layout-controls.tsx** -- Sidebar layout preference controls
- **layout-controls-options.tsx** -- Option definitions for layout control dropdowns

## Route Subdirectories

- **default/** -- Home dashboard with summary cards and sidebar
- **inventory/** -- Roll inventory, PO management, reorder rules (see `inventory/README.md`)
- **materials/** -- Material types, suppliers, pricing (see `materials/README.md`)
- **cut-planner/** -- Cut planning with NFP nesting visualizer (see `cut-planner/README.md`)
- **history/** -- Cut history log with date range filtering
- **costs/** -- Cost analysis: breakdown charts, trend charts, monthly/material cost tables
- **usage/** -- Material usage tracking: distribution charts, usage tables
- **waste/** -- Waste analysis: material waste charts, waste metrics, trend charts
- **waste-comparison/** -- Side-by-side waste comparison across time periods
- **trends/** -- Multi-metric trend analysis with seasonal patterns and key insights
- **reports/** -- Report generation from templates
- **notifications/** -- Notification center with activity feed
- **settings/** -- Application settings (general + material configuration)
- **account/** -- User profile, account info, and security settings
- **procurement/** -- Procurement-specific PO views
