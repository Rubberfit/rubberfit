import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/app/lib/utils"

/**
 * PageShell — top-level layout wrapper every dashboard surface
 * uses. Picks a max-width variant matched to the content type:
 *
 *   - `overview` (default, 1440px): KPI-dense landing pages,
 *     analytics dashboards, anything with wide multi-column rows.
 *   - `dense`    (1600px): rollups with wide tables where every
 *     pixel of horizontal space earns its keep (jobs list,
 *     purchase-orders master).
 *   - `form`     (720px): single-column forms, settings,
 *     account. Narrow on purpose.
 *
 * Rationale: centralized widths prevent each surface from picking
 * its own container class and drifting. Also sets section rhythm
 * (`space-y-6` = 24px `content-gap` token) so vertical spacing
 * between cards stays consistent.
 */
const pageShellVariants = cva("mx-auto w-full px-6 py-6 lg:px-10 lg:py-10", {
  variants: {
    variant: {
      overview: "max-w-[1600px]",
      dense: "max-w-[1800px]",
      form: "max-w-[760px]",
    },
    spacing: {
      default: "space-y-8",
      tight: "space-y-6",
      loose: "space-y-10",
    },
  },
  defaultVariants: {
    variant: "overview",
    spacing: "default",
  },
})

export interface PageShellProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof pageShellVariants> {}

export function PageShell({ className, variant, spacing, ...props }: PageShellProps) {
  return (
    <div
      data-slot="page-shell"
      data-variant={variant ?? "overview"}
      className={cn(pageShellVariants({ variant, spacing }), className)}
      {...props}
    />
  )
}
