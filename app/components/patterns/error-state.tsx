import * as React from "react"
import { AlertOctagon, RefreshCw } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { Card } from "@/app/components/ui/card"
import { cn } from "@/app/lib/utils"

import { resolveErrorCopy, type ErrorCopy } from "./error-codes"

/**
 * ErrorState — full-card error surface for page- or
 * section-level failures. Consults the machine-code registry
 * in `error-codes.ts` so call sites pass a `code` and get
 * tailored copy + intent + an action hint, rather than every
 * caller writing its own switch.
 *
 * When the code is absent or unknown, falls back to the
 * generic "something went wrong" voice. Retry handler wires
 * to the primary action button.
 *
 * Not for inline problems — use `InlineNotice` for those.
 */

const intentRing = {
  neutral: "",
  success: "text-[color:var(--success)]",
  warning: "text-[color:var(--warning)]",
  danger: "text-[color:var(--danger)]",
  info: "text-[color:var(--info)]",
  accent: "text-primary",
} as const

export interface ErrorStateProps extends React.ComponentProps<"div"> {
  /**
   * Machine code from a structured error response. Looks up
   * title/description/intent/action-label in the registry.
   */
  code?: string | null
  /**
   * Override copy if the caller has context the registry
   * doesn't. If provided, title/description/intent use these
   * instead of the registry lookup.
   */
  override?: Partial<ErrorCopy>
  /** Plain error message — used when no code is available. */
  message?: string
  onRetry?: () => void
  onPrimaryAction?: () => void
  retryLabel?: string
  extraActions?: React.ReactNode
}

function buildCopy(
  code: string | null | undefined,
  override: Partial<ErrorCopy> | undefined,
  message: string | undefined
): ErrorCopy {
  const resolved = resolveErrorCopy(code)
  return {
    title: override?.title ?? resolved?.title ?? "Something went wrong",
    description:
      override?.description ??
      resolved?.description ??
      message ??
      "The request couldn't be completed. Try again in a moment.",
    intent: override?.intent ?? resolved?.intent ?? "danger",
    actionLabel: override?.actionLabel ?? resolved?.actionLabel,
  }
}

export function ErrorState({
  code,
  override,
  message,
  onRetry,
  onPrimaryAction,
  retryLabel = "Try again",
  extraActions,
  className,
  ...props
}: ErrorStateProps) {
  const copy = buildCopy(code, override, message)

  return (
    <Card
      data-slot="error-state"
      data-code={code ?? undefined}
      role="alert"
      className={cn("flex flex-col items-center gap-4 border p-8 text-center", className)}
      {...props}
    >
      <AlertOctagon
        className={cn("size-10", intentRing[copy.intent])}
        aria-hidden="true"
      />
      <div className="max-w-md space-y-1.5">
        <h3 className="font-semibold text-lg text-foreground">{copy.title}</h3>
        <p className="text-muted-foreground text-sm">{copy.description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {copy.actionLabel && onPrimaryAction && (
          <Button type="button" size="sm" onClick={onPrimaryAction}>
            {copy.actionLabel}
          </Button>
        )}
        {onRetry && (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            {retryLabel}
          </Button>
        )}
        {extraActions}
      </div>
    </Card>
  )
}
