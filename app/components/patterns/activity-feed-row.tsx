import * as React from "react"

import { cn } from "@/app/lib/utils"

/**
 * ActivityFeedRow — timeline-style feed entry used on the
 * dashboard landing "Recent activity" block, notification
 * lists, and audit trails.
 *
 * Visual:
 *   [ icon       ] [ actor did <thing> on <target>           [time]
 *   [ leaf/line  ]   optional secondary line                        ]
 *
 * A vertical guide line connects consecutive rows; set
 * `isLast` on the last row to stop the line at the icon.
 */

export interface ActivityFeedRowProps extends Omit<React.ComponentProps<"div">, "title"> {
  icon?: React.ReactNode
  /** The main line of copy. Rich content allowed (bold actor, etc.). */
  title: React.ReactNode
  description?: React.ReactNode
  /** ISO timestamp or already-formatted relative string. */
  timestamp?: React.ReactNode
  /** When true, suppresses the vertical connecting line below the icon. */
  isLast?: boolean
}

export function ActivityFeedRow({
  icon,
  title,
  description,
  timestamp,
  isLast,
  className,
  ...props
}: ActivityFeedRowProps) {
  return (
    <div
      data-slot="activity-feed-row"
      className={cn("flex items-start gap-3 pb-4 last:pb-0", className)}
      {...props}
    >
      <div className="relative flex flex-col items-center">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground [&_svg]:size-3.5">
          {icon}
        </span>
        {!isLast && (
          <span
            aria-hidden="true"
            className="mt-1 w-px grow bg-border"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-sm text-foreground leading-snug">
            {title}
          </div>
          {timestamp && (
            <span className="shrink-0 text-muted-foreground text-xs tabular">
              {timestamp}
            </span>
          )}
        </div>
        {description && (
          <div className="mt-1 text-muted-foreground text-xs">{description}</div>
        )}
      </div>
    </div>
  )
}
