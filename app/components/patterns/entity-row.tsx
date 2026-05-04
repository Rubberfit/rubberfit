import * as React from "react"
import { ChevronRight } from "lucide-react"

import { cn } from "@/app/lib/utils"

/**
 * EntityRow — standardized list row for compact object lists
 * (low-stock list, supplier list, recent jobs, PO line items).
 *
 * Layout:
 *   [icon] [primary]                     [metadata]  [trailing]
 *         [secondary muted]
 *
 * The whole row can be a link (`href`) OR interactive (`onClick`)
 * OR both. When interactive, a ChevronRight is appended
 * automatically unless `hideChevron` is set.
 */

export interface EntityRowProps extends Omit<React.ComponentProps<"div">, "title"> {
  icon?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Aligned-right metadata block (e.g., quantity, status badge). */
  metadata?: React.ReactNode
  /** Trailing actions (kebab menu, delete button, etc.). */
  trailing?: React.ReactNode
  /**
   * Render as an anchor. When both `href` and `onActivate` are set
   * the callback fires on click (before navigation) — useful for
   * analytics / optimistic state updates. Pass either one or the
   * other if you want pure navigation OR pure handler semantics.
   */
  href?: string
  onActivate?: () => void
  hideChevron?: boolean
  density?: "compact" | "comfortable"
}

const density = {
  compact: "px-3 py-2 text-sm",
  comfortable: "px-4 py-3",
} as const

export function EntityRow({
  icon,
  title,
  subtitle,
  metadata,
  trailing,
  href,
  onActivate,
  hideChevron,
  density: densityProp = "comfortable",
  className,
  ...props
}: EntityRowProps) {
  const interactive = Boolean(href || onActivate)
  const showChevron = interactive && !hideChevron && !trailing

  const content = (
    <>
      {icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{title}</div>
        {subtitle && (
          <div className="truncate text-muted-foreground text-xs">{subtitle}</div>
        )}
      </div>
      {metadata && (
        <div className="shrink-0 text-right text-muted-foreground text-sm">
          {metadata}
        </div>
      )}
      {trailing && <div className="flex shrink-0 items-center gap-1">{trailing}</div>}
      {showChevron && (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </>
  )

  const rowClasses = cn(
    "flex w-full items-center gap-3",
    density[densityProp],
    interactive &&
      "transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    className
  )

  if (href) {
    // Forward onActivate via an onClick handler on the anchor so
    // callers that pass both get both behaviours (analytics hook +
    // navigation). Earlier revision silently dropped `onActivate`
    // when `href` was present — flagged by CodeRabbit.
    const handleAnchorClick = onActivate
      ? (e: React.MouseEvent<HTMLAnchorElement>) => {
          onActivate()
          if (props.onClick) props.onClick(e as unknown as React.MouseEvent<HTMLDivElement>)
        }
      : (props.onClick as unknown as React.MouseEventHandler<HTMLAnchorElement> | undefined)
    const { onClick: _ignored, ...anchorProps } = props
    void _ignored
    return (
      <a
        href={href}
        data-slot="entity-row"
        className={rowClasses}
        onClick={handleAnchorClick}
        {...(anchorProps as React.ComponentProps<"a">)}
      >
        {content}
      </a>
    )
  }

  if (onActivate) {
    return (
      <button
        type="button"
        onClick={onActivate}
        data-slot="entity-row"
        className={cn(rowClasses, "text-left")}
        {...(props as React.ComponentProps<"button">)}
      >
        {content}
      </button>
    )
  }

  return (
    <div data-slot="entity-row" className={rowClasses} {...props}>
      {content}
    </div>
  )
}
