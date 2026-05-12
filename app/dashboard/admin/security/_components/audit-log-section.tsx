"use client"

import {
  DataTable,
  initialSortState,
  useTableSort,
  type ColumnDef,
} from "@/app/components/patterns/data-table"
import { StatusDot } from "@/app/components/patterns/status-badge"
import { FormFieldset, FormSectionHeader } from "@/app/components/ui/forms"

import { AUDIT_EVENTS, type AuditEvent, type AuditSeverity } from "./mock-data"

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

const SEVERITY_LABEL: Record<AuditSeverity, string> = {
  info: "Info",
  success: "Success",
  warning: "Warning",
  danger: "Danger",
  accent: "Policy",
}

// Stable column definitions live at module scope so the array isn't
// recreated on every render. Cells close over per-row data only.
const AUDIT_COLUMNS: ColumnDef<AuditEvent>[] = [
  {
    id: "severity",
    header: "Severity",
    cell: (row) => (
      <div className="flex items-center gap-2">
        <StatusDot intent={row.severity} />
        <span className="text-xs text-foreground">{SEVERITY_LABEL[row.severity]}</span>
      </div>
    ),
    sortFn: (row) => row.severity,
    className: "w-[140px]",
  },
  {
    id: "timestamp",
    header: "Timestamp",
    cell: (row) => (
      <span className="font-mono text-xs tabular-nums text-foreground">
        {TIMESTAMP_FORMAT.format(new Date(row.timestamp))}
      </span>
    ),
    sortFn: (row) => new Date(row.timestamp).getTime(),
    defaultSort: "desc",
    className: "w-[160px]",
  },
  {
    id: "actor",
    header: "Actor",
    cell: (row) => <span className="text-sm text-foreground">{row.actor}</span>,
    sortFn: (row) => row.actor,
  },
  {
    id: "action",
    header: "Action",
    cell: (row) => <span className="font-mono text-xs text-foreground">{row.action}</span>,
    sortFn: (row) => row.action,
  },
  {
    id: "resource",
    header: "Resource",
    cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.resource}</span>,
    sortFn: (row) => row.resource,
  },
  {
    id: "ip",
    header: "IP",
    cell: (row) => (
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{row.ip}</span>
    ),
    align: "right",
    className: "w-[120px]",
  },
]

/**
 * Audit log section. DataTable with severity dot column. Mock
 * fixtures live in `mock-data.ts` and are gated by the
 * `TODO(ARC-DASHBOARD-AUDIT)` cleanup marker per the spec §2.3.
 */
export function AuditLogSection() {
  const [sort, setSort] = useTableSort({
    ...initialSortState,
    columnId: "timestamp",
    direction: "desc",
  })

  return (
    <FormFieldset>
      <FormSectionHeader
        eyebrow="Audit log"
        title="Recent administrative events"
        description="Last 7 days of policy, role, and authentication events. Server-side filtering and export ship with the data-wiring task."
      />
      <div className="mt-6">
        <DataTable
          columns={AUDIT_COLUMNS}
          rows={AUDIT_EVENTS}
          rowKey={(row) => row.id}
          density="comfortable"
          sort={sort}
          onSortChange={setSort}
        />
      </div>
    </FormFieldset>
  )
}
