"use client"

import * as React from "react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"
import { cn } from "@/app/lib/utils"

/**
 * DetailPanel — the right-side drawer pattern used when a
 * list row is selected and full detail should slide in
 * without navigating away.
 *
 * Layout contract:
 *   [ SheetHeader (title, subtitle, close)       ]
 *   [ content (scrollable, flex-1)               ]
 *   [ SheetFooter (primary / secondary actions)  ]
 *
 * Consumers pass header/content/footer slots. The sheet is
 * always anchored to the right edge; width scales from 480px
 * (md) to 640px (lg) to 720px (xl). For full-screen detail,
 * use a dedicated route instead.
 */

export interface DetailPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  /** Optional override for the drawer width. */
  size?: "md" | "lg" | "xl"
}

const sizeClass = {
  md: "w-full sm:max-w-[480px]",
  lg: "w-full sm:max-w-[640px]",
  xl: "w-full sm:max-w-[720px]",
} as const

export function DetailPanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  size = "lg",
}: DetailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-slot="detail-panel"
        side="right"
        className={cn("flex flex-col gap-0 p-0", sizeClass[size], className)}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <SheetFooter className="border-t px-6 py-4 sm:flex-row sm:justify-end">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
