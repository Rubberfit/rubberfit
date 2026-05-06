"use client"

import { useMemo, useState } from "react"

import type { Roll } from "@/src/infrastructure/models/supabase"
import type { ColumnDef, SortState } from "@/app/components/patterns/data-table"

interface UsePagedRollsArgs {
  rolls: Roll[]
  columns: ColumnDef<Roll>[]
  sort: SortState
  defaultPageSize: number
}

interface UsePagedRollsResult {
  pageRolls: Roll[]
  page: number
  setPage: (page: number) => void
  pageSize: number
  setPageSize: (pageSize: number) => void
  safePage: number
  pageStart: number
  pageEnd: number
  totalPages: number
  totalRolls: number
}

/**
 * Sort + paginate the rolls list outside the table component so a
 * header click re-orders rolls across pages, not just within the
 * current visible slice. DataTable's own sort hook still operates
 * on the rows it receives, but those rows arrive pre-paginated, so
 * the authoritative ordering has to happen here.
 */
export function usePagedRolls({
  rolls,
  columns,
  sort,
  defaultPageSize,
}: UsePagedRollsArgs): UsePagedRollsResult {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)

  const sortedRolls = useMemo(() => {
    if (!sort.columnId) return rolls
    const column = columns.find((c) => c.id === sort.columnId)
    if (!column?.sortFn) return rolls
    const extract = column.sortFn
    const direction = sort.direction === "desc" ? -1 : 1
    return [...rolls].sort((a, b) => {
      const av = extract(a)
      const bv = extract(b)
      if (av < bv) return -1 * direction
      if (av > bv) return 1 * direction
      return 0
    })
  }, [rolls, sort, columns])

  const totalRolls = sortedRolls.length
  const totalPages = Math.max(1, Math.ceil(totalRolls / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageEnd = Math.min(pageStart + pageSize, totalRolls)

  const pageRolls = useMemo(
    () => sortedRolls.slice(pageStart, pageEnd),
    [sortedRolls, pageStart, pageEnd]
  )

  return {
    pageRolls,
    page,
    setPage,
    pageSize,
    setPageSize,
    safePage,
    pageStart,
    pageEnd,
    totalPages,
    totalRolls,
  }
}
