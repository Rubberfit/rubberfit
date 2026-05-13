"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"

interface TablePaginationProps {
  totalRows: number
  pageStart: number
  pageEnd: number
  page: number
  totalPages: number
  pageSize: number
  pageSizeOptions: ReadonlyArray<number>
  rowLabel?: string
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

/**
 * Footer bar for `<DataTable>` consumers — shows "Showing X–Y of N",
 * a rows-per-page select, and Prev/Next buttons. Rolls' inventory,
 * the future `<InventoryTable>`-style consumers, and any future
 * paginated DataTable can compose this without recreating the
 * markup. DataTable itself stays headless on pagination by design.
 */
export function TablePagination({
  totalRows,
  pageStart,
  pageEnd,
  page,
  totalPages,
  pageSize,
  pageSizeOptions,
  rowLabel = "row",
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
      <div className="tabular-nums">
        {totalRows === 0
          ? `0 ${rowLabel}s`
          : `Showing ${pageStart + 1}–${pageEnd} of ${totalRows} ${rowLabel}${totalRows === 1 ? "" : "s"}`}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-7 w-[72px] text-xs" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums px-1">
            {totalRows === 0 ? "—" : `Page ${page} of ${totalPages}`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
