"use client"

import { ShoppingCart, X } from "lucide-react"

import { Button } from "@/app/components/ui/button"

interface BulkActionBarProps {
  count: number
  creatingBulkPO: boolean
  onClear: () => void
  onCreateBulk: () => void
}

export function BulkActionBar({
  count,
  creatingBulkPO,
  onClear,
  onCreateBulk,
}: BulkActionBarProps) {
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-6 py-3 lg:px-10">
        <span className="text-sm font-medium text-foreground">
          {count} suggestion{count === 1 ? "" : "s"} selected
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClear} disabled={creatingBulkPO}>
            <X className="size-3.5" aria-hidden="true" />
            Clear
          </Button>
          <Button size="sm" onClick={onCreateBulk} disabled={creatingBulkPO}>
            <ShoppingCart className="size-3.5" aria-hidden="true" />
            {creatingBulkPO ? "Creating…" : "Create POs in batch"}
          </Button>
        </div>
      </div>
    </div>
  )
}
