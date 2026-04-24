"use client"

import * as React from "react"
import { Search } from "lucide-react"

import { Input } from "@/app/components/ui/input"
import { cn } from "@/app/lib/utils"

/**
 * ViewToolbar — the row of affordances that sits above every
 * list surface: search, filter chips, saved views, density /
 * layout switch, export.
 *
 * Left: search + filters. Right: view / density / export.
 * Operators read left to right; primary "what am I looking
 * at" controls on the left, presentation controls on the
 * right.
 *
 * The toolbar renders whatever children you pass into the
 * `filters` and `actions` slots; it owns the layout
 * (responsive, wraps on small screens) and the search field
 * only.
 */

export interface ViewToolbarProps extends React.ComponentProps<"div"> {
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  filters?: React.ReactNode
  actions?: React.ReactNode
  hideSearch?: boolean
}

export function ViewToolbar({
  searchPlaceholder = "Search…",
  searchValue,
  onSearchChange,
  filters,
  actions,
  hideSearch,
  className,
  ...props
}: ViewToolbarProps) {
  return (
    <div
      data-slot="view-toolbar"
      className={cn(
        "flex flex-col gap-3 border-b bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {!hideSearch && (
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search
              className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(event) => onSearchChange?.(event.currentTarget.value)}
              className="pl-8"
            />
          </div>
        )}
        {filters && <div className="flex flex-wrap items-center gap-1.5">{filters}</div>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      )}
    </div>
  )
}
