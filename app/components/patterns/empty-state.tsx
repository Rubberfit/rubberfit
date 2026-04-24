import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/app/components/ui/empty"
import { cn } from "@/app/lib/utils"

/**
 * EmptyState — the shared empty-state pattern. Four variants
 * from Vercel Geist's Empty State spec:
 *
 *   - `blank`: no data yet. Neutral copy, optional primary CTA
 *     to create the first item.
 *   - `informational`: zero results after a filter. Keeps the
 *     filter context in view; primary CTA is usually "Clear
 *     filters" or similar.
 *   - `educational`: first-run onboarding. Richer copy with a
 *     primary action that walks the operator into the feature.
 *   - `guide`: missing setup step (no suppliers yet, no
 *     payment method, etc.). Points to the blocking prereq.
 *
 * Picks the correct voice based on variant; call sites provide
 * copy + optional CTA only.
 */

const emptyStateVariants = cva("", {
  variants: {
    variant: {
      blank: "",
      informational: "",
      educational: "",
      guide: "",
    },
  },
  defaultVariants: { variant: "blank" },
})

export interface EmptyStateProps
  extends Omit<React.ComponentProps<"div">, "title">,
    VariantProps<typeof emptyStateVariants> {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  primaryAction?: React.ReactNode
  secondaryAction?: React.ReactNode
}

export function EmptyState({
  variant = "blank",
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <Empty
      data-slot="empty-state"
      data-variant={variant}
      className={cn("border bg-card", emptyStateVariants({ variant }), className)}
      {...props}
    >
      <EmptyHeader>
        {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {(primaryAction || secondaryAction) && (
        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {primaryAction}
            {secondaryAction}
          </div>
        </EmptyContent>
      )}
    </Empty>
  )
}
