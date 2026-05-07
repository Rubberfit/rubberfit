"use client"

import { useMemo, useState } from "react"
import { FileText } from "lucide-react"

import {
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
  type Supplier,
} from "@/src/infrastructure/models/supabase"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { DataTable, initialSortState, useTableSort } from "@/app/components/patterns/data-table"
import { EmptyState, ViewToolbar } from "@/app/components/patterns"

import { TablePagination } from "@/app/dashboard/inventory/_components/table-pagination"
import { usePoColumns } from "./use-po-columns"

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 25

interface POTableProps {
  loading: boolean
  filteredPOs: PurchaseOrderWithDetails[]
  suppliers: Supplier[]
  statusFilter: string
  setStatusFilter: (v: string) => void
  supplierFilter: string
  setSupplierFilter: (v: string) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  onViewPO: (po: PurchaseOrderWithDetails) => void
  onEditPO: (po: PurchaseOrderWithDetails) => void
  onUpdatePOStatus: (poId: string, newStatus: PurchaseOrder["status"]) => Promise<void>
  onCancelPO: (po: PurchaseOrderWithDetails) => void
  fetchData: () => void
}

/**
 * Purchase order list — Phase 3 PR 3c. Migrated from a hand-rolled
 * shadcn `<Table>` to the shared `<DataTable>` primitive. Filters
 * (search + status + supplier) sit in `<ViewToolbar>` above the
 * table, pagination uses the same `<TablePagination>` extracted
 * from PR 3a's inventory list. Row dropdown actions (View / Edit /
 * status transitions / Download / Cancel) live in
 * `use-po-columns.tsx` so this component stays compact.
 */
export function POTable({
  loading,
  filteredPOs,
  suppliers,
  statusFilter,
  setStatusFilter,
  supplierFilter,
  setSupplierFilter,
  searchQuery,
  setSearchQuery,
  onViewPO,
  onEditPO,
  onUpdatePOStatus,
  onCancelPO,
}: POTableProps) {
  const [sort, setSort] = useTableSort({
    ...initialSortState,
    columnId: "order_date",
    direction: "desc",
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)

  const columns = usePoColumns({
    onView: onViewPO,
    onEdit: onEditPO,
    onUpdateStatus: onUpdatePOStatus,
    onCancel: onCancelPO,
  })

  const sortedPOs = useMemo(() => {
    if (!sort.columnId) return filteredPOs
    const column = columns.find((c) => c.id === sort.columnId)
    if (!column?.sortFn) return filteredPOs
    const extract = column.sortFn
    const direction = sort.direction === "desc" ? -1 : 1
    return [...filteredPOs].sort((a, b) => {
      const av = extract(a)
      const bv = extract(b)
      if (av < bv) return -1 * direction
      if (av > bv) return 1 * direction
      return 0
    })
  }, [filteredPOs, sort, columns])

  const totalRows = sortedPOs.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageEnd = Math.min(pageStart + pageSize, totalRows)
  const pageRows = useMemo(
    () => sortedPOs.slice(pageStart, pageEnd),
    [sortedPOs, pageStart, pageEnd]
  )

  const filterControls = (
    <>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="h-9 w-[150px]" aria-label="Status filter">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="ordered">Ordered</SelectItem>
          <SelectItem value="received">Received</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>
      <Select value={supplierFilter} onValueChange={setSupplierFilter}>
        <SelectTrigger className="h-9 w-[200px]" aria-label="Supplier filter">
          <SelectValue placeholder="All suppliers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All suppliers</SelectItem>
          {suppliers.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )

  if (loading) {
    return (
      <>
        <ViewToolbar
          searchPlaceholder="Search PO number, supplier, or notes…"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          filters={filterControls}
        />
        <div className="px-6 py-8 text-center text-muted-foreground text-sm">
          Loading purchase orders…
        </div>
      </>
    )
  }

  if (filteredPOs.length === 0) {
    return (
      <>
        <ViewToolbar
          searchPlaceholder="Search PO number, supplier, or notes…"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          filters={filterControls}
        />
        <EmptyState
          icon={<FileText className="size-5" />}
          title="No purchase orders found"
          description={
            searchQuery || statusFilter !== "all" || supplierFilter !== "all"
              ? "Try adjusting your filters."
              : "Create a new purchase order with the button in the header."
          }
        />
      </>
    )
  }

  return (
    <>
      <ViewToolbar
        searchPlaceholder="Search PO number, supplier, or notes…"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        filters={filterControls}
      />
      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(row) => row.id}
        sort={sort}
        onSortChange={setSort}
        density="comfortable"
        onRowClick={(row) => onViewPO(row)}
        empty={
          <EmptyState
            icon={<FileText className="size-5" />}
            title="No matching POs"
            description="Try adjusting your search."
          />
        }
        className="border-0 rounded-none"
      />
      <TablePagination
        totalRows={totalRows}
        pageStart={pageStart}
        pageEnd={pageEnd}
        page={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        rowLabel="PO"
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n)
          setPage(1)
        }}
      />
    </>
  )
}
