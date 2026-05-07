"use client"

import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import {
  DataTable,
  EmptyState,
  type ColumnDef,
} from "@/app/components/patterns"
import { cn } from "@/app/lib/utils"

/**
 * Recent cuts table — matches the Operations Overview mock.
 * Compact density, tabular utilization column colour-coded by
 * threshold (>= 85% success, 75–85% warning, < 75% danger).
 */

export interface RecentCutRow {
  id: string
  jobCode: string
  operator: string
  utilizationPct: number
  whenLabel: string
}

interface RecentCutsCardProps {
  rows: ReadonlyArray<RecentCutRow>
  isLoading?: boolean
  className?: string
}

function utilColorClass(pct: number): string {
  // Per Kimi's §6: ≥90 healthy, 75–89 watch, <75 intervention.
  // Watch maps to signal-orange (not warning amber) so "supervisor
  // glance here" matches the rest of the dashboard's attention
  // semantic.
  if (pct >= 90) return "text-success"
  if (pct >= 75) return "text-primary"
  return "text-danger"
}

export function RecentCutsCard({ rows, isLoading, className }: RecentCutsCardProps) {
  const router = useRouter()

  const columns: ColumnDef<RecentCutRow>[] = [
    {
      id: "jobCode",
      header: "Job",
      cell: (row) => <span className="font-mono text-xs">{row.jobCode}</span>,
      className: "w-[28%]",
    },
    {
      id: "operator",
      header: "Operator",
      cell: (row) => row.operator,
      className: "w-[28%]",
    },
    {
      id: "util",
      header: "Util",
      cell: (row) => (
        <span className={cn("tabular font-medium", utilColorClass(row.utilizationPct))}>
          {row.utilizationPct.toFixed(1)}%
        </span>
      ),
      className: "w-[22%]",
      align: "right",
    },
    {
      id: "when",
      header: "When",
      cell: (row) => <span className="text-muted-foreground">{row.whenLabel}</span>,
      className: "w-[22%]",
      align: "right",
    },
  ]

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Live feed
          </p>
          <h2 className="mt-1 font-display font-semibold text-foreground text-xl tracking-tight">
            Recent cuts
          </h2>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => router.push("/dashboard/history")}
        >
          View all
          <ArrowRight className="size-3" />
        </Button>
      </header>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        density="compact"
        isLoading={isLoading}
        empty={
          <EmptyState
            className="border-0 bg-transparent"
            variant="informational"
            title="No cuts yet"
            description="Completed cuts will appear here with operator + utilization."
          />
        }
      />
    </section>
  )
}
