import * as React from "react"

import { Card } from "@/app/components/ui/card"
import { Skeleton } from "@/app/components/ui/skeleton"
import { cn } from "@/app/lib/utils"

/**
 * LoadingCard — skeleton matched to the final rendered card
 * (title + subtitle + N stat rows). Keeps the page's layout
 * stable during load; prevents the CLS jump when real data
 * arrives.
 *
 * Tune the shape (rows + metricRows) to the target card so
 * the skeleton matches visually.
 */

export interface LoadingCardProps extends React.ComponentProps<"div"> {
  /** Number of stacked text rows in the body. */
  rows?: number
  /** Number of horizontal metric rows (label + value pair). */
  metricRows?: number
  /** Optional skeleton height for the main value. */
  showTitle?: boolean
}

export function LoadingCard({
  rows = 2,
  metricRows = 0,
  showTitle = true,
  className,
  ...props
}: LoadingCardProps) {
  return (
    <Card
      data-slot="loading-card"
      aria-busy="true"
      className={cn("space-y-4 p-4", className)}
      {...props}
    >
      {showTitle && (
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-40" />
        </div>
      )}
      {rows > 0 && (
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full" style={{ width: `${85 - i * 10}%` }} />
          ))}
        </div>
      )}
      {metricRows > 0 && (
        <div className="space-y-2 pt-2">
          {Array.from({ length: metricRows }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
