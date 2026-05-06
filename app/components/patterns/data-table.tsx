"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { cn } from "@/app/lib/utils"

import { LoadingTable } from "./loading-table"

/**
 * DataTable — lightweight styled wrapper around the shadcn
 * `table` primitive. No TanStack dependency; sort and filter
 * are client-side and driven by the `useTableSort` /
 * `useTableFilter` hooks in this module.
 *
 * Contract:
 *   - Caller provides an array of rows + an array of column
 *     definitions.
 *   - The table handles render, sort indicator clicks, and
 *     empty / loading states.
 *   - Server-side pagination, faceted filters, and column
 *     virtualization are deliberately out of scope. If a
 *     surface needs those, it opens a TanStack-adoption
 *     ticket.
 */

export type TableDensity = "compact" | "comfortable"

export interface ColumnDef<T> {
  id: string
  header: React.ReactNode
  /** Cell renderer. */
  cell: (row: T, index: number) => React.ReactNode
  /** Extraction function for sorting. Omit to disable sort. */
  sortFn?: (row: T) => string | number
  /** Tailwind width / alignment classes applied to <th> and <td>. */
  className?: string
  /** Header-only class (overrides column className for the <th>). */
  headerClassName?: string
  /** Right-align the column (standard for numeric cells). */
  align?: "left" | "right" | "center"
  /** Default sort direction when first clicked. */
  defaultSort?: "asc" | "desc"
}

export interface DataTableProps<T> extends React.ComponentProps<"div"> {
  columns: ReadonlyArray<ColumnDef<T>>
  rows: ReadonlyArray<T>
  rowKey: (row: T, index: number) => string | number
  density?: TableDensity
  /** Click handler for row activation (opens detail panel, etc.). */
  onRowClick?: (row: T, index: number) => void
  /** Loading skeleton. */
  isLoading?: boolean
  /** Empty state slot (render a `<EmptyState>` here). */
  empty?: React.ReactNode
  /** Sort state. Omit for no sort. */
  sort?: SortState
  onSortChange?: (sort: SortState) => void
  /** Row-level style hook (e.g., highlight selected row). */
  rowClassName?: (row: T, index: number) => string | undefined
}

const density = {
  compact: { row: "h-9", cell: "py-1.5" },
  comfortable: { row: "h-11", cell: "py-2.5" },
} as const

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  density: densityProp = "comfortable",
  onRowClick,
  isLoading,
  empty,
  sort,
  onSortChange,
  rowClassName,
  className,
  ...props
}: DataTableProps<T>) {
  const sortedRows = React.useMemo(() => {
    if (!sort || !sort.columnId) return rows
    const column = columns.find((c) => c.id === sort.columnId)
    if (!column?.sortFn) return rows
    const extractor = column.sortFn
    const direction = sort.direction === "desc" ? -1 : 1
    return [...rows].sort((a, b) => {
      const av = extractor(a)
      const bv = extractor(b)
      if (av < bv) return -1 * direction
      if (av > bv) return 1 * direction
      return 0
    })
  }, [rows, sort, columns])

  if (isLoading) {
    return (
      <LoadingTable
        rows={6}
        columnWidths={columns.map(() => 100 / columns.length)}
        density={densityProp}
        className={className}
      />
    )
  }

  if (!sortedRows.length && empty) {
    return (
      <div data-slot="data-table-empty" className={cn("rounded-md border bg-card", className)}>
        {empty}
      </div>
    )
  }

  return (
    <div
      data-slot="data-table"
      className={cn("overflow-hidden rounded-md border bg-card", className)}
      {...props}
    >
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {columns.map((column) => {
              const sortable = Boolean(column.sortFn && onSortChange)
              const isActive = sort?.columnId === column.id
              const activeDir = isActive ? sort?.direction : undefined
              return (
                <TableHead
                  key={column.id}
                  className={cn(
                    "font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground",
                    alignClass[column.align ?? "left"],
                    column.className,
                    column.headerClassName
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      onClick={() =>
                        onSortChange?.(nextSortState(sort, column.id, column.defaultSort ?? "asc"))
                      }
                    >
                      <span>{column.header}</span>
                      {activeDir === "asc" ? (
                        <ArrowUp className="size-3" aria-hidden="true" />
                      ) : activeDir === "desc" ? (
                        <ArrowDown className="size-3" aria-hidden="true" />
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-60" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row, index) => {
            const interactive = Boolean(onRowClick)
            return (
              <TableRow
                key={rowKey(row, index)}
                className={cn(
                  density[densityProp].row,
                  interactive && "cursor-pointer",
                  rowClassName?.(row, index)
                )}
                onClick={interactive ? () => onRowClick?.(row, index) : undefined}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn(
                      density[densityProp].cell,
                      alignClass[column.align ?? "left"],
                      column.className
                    )}
                  >
                    {column.cell(row, index)}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ── Sort state ──────────────────────────────────────────

export interface SortState {
  columnId: string | null
  direction: "asc" | "desc"
}

export const initialSortState: SortState = { columnId: null, direction: "asc" }

function nextSortState(
  current: SortState | undefined,
  columnId: string,
  defaultDir: "asc" | "desc"
): SortState {
  if (!current || current.columnId !== columnId) {
    return { columnId, direction: defaultDir }
  }
  if (current.direction === defaultDir) {
    return { columnId, direction: defaultDir === "asc" ? "desc" : "asc" }
  }
  return { columnId: null, direction: "asc" }
}

/**
 * useTableSort — minimal controlled-sort helper. Returns
 * [sort, setSort] tied to a useState; feed into `DataTable`.
 */
export function useTableSort(initial: SortState = initialSortState) {
  return React.useState<SortState>(initial)
}

/**
 * useTableFilter — minimal client-side filter. Caller
 * provides a predicate factory; returns the filter string +
 * filtered rows.
 */
export function useTableFilter<T>(
  rows: ReadonlyArray<T>,
  predicate: (row: T, query: string) => boolean,
  initial = ""
) {
  const [query, setQuery] = React.useState(initial)
  const filtered = React.useMemo(() => {
    if (!query.trim()) return rows
    const normalized = query.trim().toLowerCase()
    return rows.filter((row) => predicate(row, normalized))
  }, [rows, query, predicate])
  return { query, setQuery, filtered }
}

/**
 * useTableDensity — density toggle state. Persisted in memory
 * only; if you want to persist across sessions, lift to the
 * preferences store.
 */
export function useTableDensity(initial: TableDensity = "comfortable") {
  return React.useState<TableDensity>(initial)
}
