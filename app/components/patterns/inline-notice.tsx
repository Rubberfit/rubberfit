import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"

import { cn } from "@/app/lib/utils"

/**
 * InlineNotice — inline-level information / warning / danger /
 * success banner that lives inside a page surface (a card, a
 * form section, a table header). Not a toast.
 *
 * Use when:
 *   - A form section has a hidden constraint the user needs
 *     to see before submitting.
 *   - A table has a filter applied that hides some rows and
 *     you want to make that visible.
 *   - A flow is partially complete and the operator needs a
 *     prompt to continue.
 *
 * Do NOT use for:
 *   - Transient "saved" confirmations (use a toast).
 *   - Full-page error states (use `ErrorState`).
 */

const noticeVariants = cva(
  "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm",
  {
    variants: {
      intent: {
        info: "bg-[color:var(--info-bg)] text-[color:var(--info-foreground)] border-[color:var(--info-border)]",
        success:
          "bg-[color:var(--success-bg)] text-[color:var(--success-foreground)] border-[color:var(--success-border)]",
        warning:
          "bg-[color:var(--warning-bg)] text-[color:var(--warning-foreground)] border-[color:var(--warning-border)]",
        danger:
          "bg-[color:var(--danger-bg)] text-[color:var(--danger-foreground)] border-[color:var(--danger-border)]",
      },
    },
    defaultVariants: {
      intent: "info",
    },
  }
)

const intentIcon = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
} as const

export interface InlineNoticeProps
  extends Omit<React.ComponentProps<"div">, "title">,
    VariantProps<typeof noticeVariants> {
  title?: React.ReactNode
  actions?: React.ReactNode
  icon?: React.ReactNode
}

export function InlineNotice({
  intent = "info",
  title,
  actions,
  icon,
  className,
  children,
  ...props
}: InlineNoticeProps) {
  const DefaultIcon = intentIcon[intent ?? "info"]
  return (
    <div
      data-slot="inline-notice"
      data-intent={intent}
      role={intent === "danger" || intent === "warning" ? "alert" : "status"}
      className={cn(noticeVariants({ intent }), className)}
      {...props}
    >
      <span className="mt-0.5 shrink-0">
        {icon ?? <DefaultIcon className="size-4" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {title && <div className="font-medium leading-tight">{title}</div>}
        {children && <div className="text-xs leading-relaxed opacity-90">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  )
}
