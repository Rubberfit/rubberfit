import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { cn } from "@/app/lib/utils"

/**
 * PageHeader — the standard top-of-page header. Carries a title,
 * optional subtitle, optional breadcrumb trail, and a primary-
 * action slot.
 *
 * Layout:
 *   [ Breadcrumbs                                  ]
 *   [ Title / Subtitle        ][ Actions slot (→) ]
 *
 * The title uses the H1 display scale (text-2xl, semibold,
 * tracking-tight). Subtitle is muted-foreground at xs. Breadcrumb
 * uses ChevronRight separators and muted text with primary active
 * segment.
 */

export interface PageHeaderCrumb {
  label: string
  href?: string
}

export interface PageHeaderProps extends React.ComponentProps<"header"> {
  title: string
  subtitle?: React.ReactNode
  crumbs?: readonly PageHeaderCrumb[]
  actions?: React.ReactNode
  /**
   * Optional mono-uppercase eyebrow rendered above the title.
   * Use for spec-sheet context strings like
   * "Operations / Week · May 4 – May 10".
   */
  eyebrow?: React.ReactNode
}

export function PageHeader({
  title,
  subtitle,
  crumbs,
  actions,
  eyebrow,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn("flex flex-col gap-2", className)} {...props}>
      {eyebrow && (
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {eyebrow}
        </p>
      )}
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 text-muted-foreground text-xs">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1
              return (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                  {crumb.href && !isLast ? (
                    <Link href={crumb.href} className="hover:text-foreground transition-colors">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={cn(isLast && "font-medium text-foreground")}
                      aria-current={isLast ? "page" : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && <ChevronRight className="size-3 shrink-0" aria-hidden="true" />}
                </li>
              )
            })}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="truncate font-display font-semibold text-[28px] text-foreground tracking-tight leading-8">
            {title}
          </h1>
          {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
