import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/app/lib/utils"

/**
 * StatusBadge + StatusDot — the shared status affordance used
 * across rolls (stock level), POs (state), cuts (result), and
 * suppliers (activity). One grammar everywhere.
 *
 * Intent tokens map to the Task 1 status triples
 * (success / warning / danger / info / neutral). Never
 * hard-code colors at the call site; pick the intent that
 * describes the data state and let the token decide the paint.
 */

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      intent: {
        neutral: "bg-muted text-muted-foreground border-border",
        success:
          "bg-[color:var(--success-bg)] text-[color:var(--success-foreground)] border-[color:var(--success-border)]",
        warning:
          "bg-[color:var(--warning-bg)] text-[color:var(--warning-foreground)] border-[color:var(--warning-border)]",
        danger:
          "bg-[color:var(--danger-bg)] text-[color:var(--danger-foreground)] border-[color:var(--danger-border)]",
        info: "bg-[color:var(--info-bg)] text-[color:var(--info-foreground)] border-[color:var(--info-border)]",
        accent: "bg-accent text-accent-foreground border-accent",
      },
      variant: {
        solid: "",
        outline: "bg-transparent",
        dot: "bg-transparent border-transparent px-0",
      },
    },
    defaultVariants: {
      intent: "neutral",
      variant: "solid",
    },
  }
)

const dotColor = {
  neutral: "bg-muted-foreground/70",
  success: "bg-[color:var(--success)]",
  warning: "bg-[color:var(--warning)]",
  danger: "bg-[color:var(--danger)]",
  info: "bg-[color:var(--info)]",
  accent: "bg-primary",
} as const

export type StatusIntent = NonNullable<VariantProps<typeof badgeVariants>["intent"]>

export interface StatusBadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  /** Show the leading colored dot. Auto-on when variant="dot". */
  withDot?: boolean
}

export function StatusBadge({
  className,
  intent = "neutral",
  variant = "solid",
  withDot,
  children,
  ...props
}: StatusBadgeProps) {
  const showDot = withDot ?? variant === "dot"
  return (
    <span
      data-slot="status-badge"
      data-intent={intent}
      className={cn(badgeVariants({ intent, variant }), className)}
      {...props}
    >
      {showDot && (
        <span
          className={cn("inline-block size-1.5 shrink-0 rounded-full", dotColor[intent ?? "neutral"])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}

/** Standalone colored dot — for compact list rows where the label is elsewhere. */
export function StatusDot({
  intent = "neutral",
  className,
  ...props
}: { intent?: StatusIntent } & React.ComponentProps<"span">) {
  return (
    <span
      data-slot="status-dot"
      data-intent={intent}
      className={cn("inline-block size-2 shrink-0 rounded-full", dotColor[intent], className)}
      aria-hidden="true"
      {...props}
    />
  )
}
