/**
 * Pattern library barrel. Import from `@/app/components/patterns`
 * rather than deep-importing the individual files — the barrel
 * is where the pattern surface is intentionally shaped.
 *
 * Scoping rule: if a component renders in more than one page,
 * it lives here or it's a shadcn primitive in `../ui/`.
 */

// Task 2a — layout + status primitives
export { PageShell, type PageShellProps } from "./page-shell"
export { PageHeader, type PageHeaderProps, type PageHeaderCrumb } from "./page-header"
export { StatCard, type StatCardProps, type StatCardTrend } from "./stat-card"
export {
  StatusBadge,
  StatusDot,
  type StatusBadgeProps,
  type StatusIntent,
} from "./status-badge"
export { InlineNotice, type InlineNoticeProps } from "./inline-notice"
export {
  resolveErrorCopy,
  isKnownErrorCode,
  type ErrorCode,
  type ErrorCopy,
} from "./error-codes"

// Task 2b — data + content patterns
export { EmptyState, type EmptyStateProps } from "./empty-state"
export { LoadingCard, type LoadingCardProps } from "./loading-card"
export { LoadingTable, type LoadingTableProps } from "./loading-table"
export { ErrorState, type ErrorStateProps } from "./error-state"
export { EntityRow, type EntityRowProps } from "./entity-row"
export { ActivityFeedRow, type ActivityFeedRowProps } from "./activity-feed-row"

// Task 2c — navigation + toolbar + data-table
export { ViewToolbar, type ViewToolbarProps } from "./view-toolbar"
export { DetailPanel, type DetailPanelProps } from "./detail-panel"
export {
  DataTable,
  useTableSort,
  useTableFilter,
  useTableDensity,
  initialSortState,
  type DataTableProps,
  type ColumnDef,
  type SortState,
  type TableDensity,
} from "./data-table"

// S5 A0.4 — workspace / three-column editor layout
export {
  WorkspaceColumn,
  WorkspaceRow,
  type WorkspaceColumnProps,
} from "./workspace-column"
