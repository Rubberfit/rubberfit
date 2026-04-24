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
  if (pct >= 85) return "text-[color:var(--success-foreground)]"
  if (pct >= 75) return "text-[color:var(--warning-foreground)]"
  return "text-[color:var(--danger-foreground)]"
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
      <header className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground text-sm">Recent cuts</h2>
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
