# dashboard/

Main dashboard layout, navigation, and shared components. All authenticated pages live under this route.

## Files

- **layout.tsx** -- Server component: reads user preferences from cookies, renders ProtectedRoute wrapper, SidebarProvider, and the app sidebar shell
- **page.tsx** -- Operations Overview landing (S4 Task 5 rewrite matching the approved mock): `PageHeader` with tenant + week subtitle, period toggle (week/month/quarter), Export CTA (CSV + PDF dropdown — wired in issue #122 via `DashboardExportMenu`); 4 KPI `StatCard`s with sparklines + trend deltas; stacked "Utilization by material" chart + "Recent cuts" `DataTable` in a two-column row; "Low stock · reorder needed" + "Recent activity" feed below. Consumes `rollService`, `cutService`, `materialTypeService` via `Promise.all`. Jobs funnel from the mock is deferred to Q4 (Jobs domain). Pre-S4 `/dashboard/default` URLs 308-redirect here.

## \_components/

Shared components used across multiple dashboard pages. Roll-specific components (table, form dialog, form fields, CSV upload) moved to `inventory/_components/` in the Jobs-phase inventory pass — they were only ever used by the inventory surface, and keeping them here forced cross-directory relative imports from supplier selection and a split fetch path between the page and the table. See `inventory/README.md` for the new layout.

- **material-summary-chart.tsx** -- Recharts bar chart showing material type distribution
- **waste-trend-chart.tsx** -- Recharts line chart showing waste percentage over time
- **dashboard-summary-cards.tsx** -- KPI `StatCard` row for the Operations Overview: Active Rolls, Cuts This Week (with growth trend), Material Waste (with improvement trend), Inventory Value. Sparklines wired from `getWasteTrendByWeek` + `getCutsThisWeek` per-day aggregation. Rewritten in S4 Task 5 to consume the pattern library.
- **dashboard-activity-aside.tsx** -- Low-stock list (`EntityRow` + `StatusBadge` with per-row Create PO CTA) + recent activity feed (`ActivityFeedRow`). Two-column layout under the header row. Rewritten in S4 Task 5 to consume the pattern library.
- **dashboard-utilization-card.tsx** -- Stacked bar chart of cut volume by material × weekday (recharts `BarChart`). Inline 7d/30d/90d segmented control. Added in S4 Task 5. Matches the user-approved Operations Overview mock.
- **dashboard-recent-cuts-card.tsx** -- Compact `DataTable` of the 5 most recent cuts (Job, Operator, Util%, When). Utilization column colour-coded by threshold via `--success/warning/danger-foreground` tokens. Added in S4 Task 5.
- **dashboard-export-menu.tsx** -- CSV/PDF dropdown wiring the Operations overview Export action (issue #122). CSV goes through `exportService.exportToCSV`; PDF goes through the branded jsPDF builder in `dashboard-pdf.ts` (no longer the generic HTML-to-PDF path).
- **dashboard-export-utils.ts** -- Pure data shaper `buildOperationsCsv` for the CSV export. Filename is period-scoped (`operations-overview_<week|month|quarter>`). Cells starting with formula-prefix characters are sanitized for spreadsheet safety.
- **dashboard-pdf.ts** -- jsPDF builder for the Operations overview PDF. **Phase 7 PR 2:** rebuilt on the shared `app/lib/pdf` design system. Internal canvas (A4 595×842pt @ 42pt margin — moved from millimetres). Composes `drawInternalChrome`, `drawKpiCard` (4-up summary strip), `drawSectionDivider`, `drawRuledTable` (utilization + recent-cuts), `stampFooterOnEveryPage`. Exposes `buildOperationsPdf(input): Blob` for tests and `downloadOperationsPdf(input)` for the menu.

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
- **cutting-engine/** -- 2D nesting visualizer (renamed from cut-planner in S4 Task 8; batch + manual modes deleted; see `cutting-engine/README.md`)
- **history/** -- Cut history log with date range filtering
- **analytics/** -- Consolidated Analytics shell (S4 Task 9). Nested `/dashboard/analytics/{waste,waste-comparison,usage,costs,trends,reports}` routes under a shared `layout.tsx` that renders the tab strip. Pre-S4 top-level paths (`/dashboard/waste`, `/dashboard/costs`, etc.) 308-redirect into this subtree via `next.config.mjs`. See `analytics/README.md` for the sub-page list.
- **notifications/** -- Notification center with activity feed
- **settings/** -- Consolidated settings (S4 Task 10). Tabs for General / Profile & account / Materials / Notifications under a shared `layout.tsx`. Absorbs the prior `/dashboard/account` route; legacy URL 308-redirects to `/settings/profile`.
- **security/** -- Customer-facing Trust & Security FAQ surface. Grounded in the codebase (RLS coverage, append-only admin audit log, zero-analytics package.json, middleware gates). Ungated nav entry so invited IT/procurement reviewers on a viewer seat can read it directly. See `security/README.md`.
- **procurement/** -- Procurement-specific PO views
