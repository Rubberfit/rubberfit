import * as React from "react"

import { Skeleton } from "@/app/components/ui/skeleton"
import { cn } from "@/app/lib/utils"

/**
 * LoadingTable — skeleton for a table-shaped list, rendered
 * behind a <table> so rows match the final layout. Caller
 * passes column widths as a percent tuple so the skeleton
 * matches the header.
 *
 * Density follows the parent's row-height choice (compact =
 * 36px, comfortable = 44px).
 */

export interface LoadingTableProps extends React.ComponentProps<"div"> {
  rows?: number
  /** Percent widths per column (e.g. [25, 35, 20, 20]). */
  columnWidths?: readonly number[]
  density?: "compact" | "comfortable"
  showHeader?: boolean
}

const rowHeight = {
  compact: "h-9",
  comfortable: "h-11",
} as const

export function LoadingTable({
  rows = 6,
  columnWidths = [30, 30, 20, 20],
  density = "comfortable",
  showHeader = true,
  className,
  ...props
}: LoadingTableProps) {
  const cols = columnWidths.length
  return (
    <div
      data-slot="loading-table"
      aria-busy="true"
      className={cn("w-full overflow-hidden rounded-md border bg-card", className)}
      {...props}
    >
      {showHeader && (
        <div className="flex items-center gap-4 border-b px-4 py-3">
          {columnWidths.map((w, i) => (
            <Skeleton key={i} className="h-3" style={{ width: `${w * 0.6}%`, flex: `0 0 ${w}%` }} />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className={cn(
            "flex items-center gap-4 border-b px-4 last:border-b-0",
            rowHeight[density]
          )}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-3"
              style={{ width: `${columnWidths[c] * 0.85}%`, flex: `0 0 ${columnWidths[c]}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
