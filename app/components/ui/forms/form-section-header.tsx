import * as React from "react"

import { cn } from "@/app/lib/utils"

export interface FormSectionHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Mono-uppercase eyebrow above the title (e.g., "Inventory"). */
  eyebrow?: React.ReactNode
  /** Section heading. Renders as Manrope H2 by default. */
  title: React.ReactNode
  /** Inter-body description, capped at ~55ch reading width. */
  description?: React.ReactNode
  /** Heading level. Defaults to `h2`; use `h3` for nested fieldsets. */
  as?: "h2" | "h3"
}

/**
 * Section header for Settings and Admin surfaces.
 * See `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §3.4.
 */
export function FormSectionHeader({
  eyebrow,
  title,
  description,
  as: HeadingTag = "h2",
  className,
  ...props
}: FormSectionHeaderProps) {
  return (
    <header data-slot="form-section-header" className={cn("space-y-1", className)} {...props}>
      {eyebrow ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {eyebrow}
        </p>
      ) : null}
      <HeadingTag className="font-display text-lg font-semibold leading-6 tracking-tight text-foreground">
        {title}
      </HeadingTag>
      {description ? (
        <p className="max-w-[55ch] text-sm leading-5 text-muted-foreground">{description}</p>
      ) : null}
    </header>
  )
}
