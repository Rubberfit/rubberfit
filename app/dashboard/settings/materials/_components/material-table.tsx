"use client"

import { Pencil, Trash2 } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import {
  DataTable,
  initialSortState,
  useTableSort,
  type ColumnDef,
} from "@/app/components/patterns/data-table"
import { EmptyState } from "@/app/components/patterns/empty-state"
import { type MaterialType } from "@/src/infrastructure/models/supabase"

interface MaterialTableProps {
  materials: ReadonlyArray<MaterialType>
  isLoading: boolean
  onEdit: (material: MaterialType) => void
  onDelete: (material: MaterialType) => void
  onAddNew: () => void
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const stockFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

export function MaterialTable({
  materials,
  isLoading,
  onEdit,
  onDelete,
  onAddNew,
}: MaterialTableProps) {
  const [sort, setSort] = useTableSort({ ...initialSortState, columnId: "name", direction: "asc" })

  const columns: ColumnDef<MaterialType>[] = [
    {
      id: "name",
      header: "Name",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          {row.description ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={row.description}>
              {row.description}
            </p>
          ) : null}
        </div>
      ),
      sortFn: (row) => row.name?.toLowerCase() ?? "",
      defaultSort: "asc",
      className: "min-w-0 max-w-[40%]",
    },
    {
      id: "min_stock_alert",
      header: "Min stock (sqft)",
      cell: (row) => (
        <span className="font-mono tabular-nums">
          {stockFormatter.format(row.min_stock_alert ?? 0)}
        </span>
      ),
      sortFn: (row) => row.min_stock_alert ?? 0,
      defaultSort: "desc",
      align: "right",
      className: "w-[180px]",
    },
    {
      id: "default_cost",
      header: "Default cost",
      cell: (row) => (
        <span className="font-mono tabular-nums">
          {currencyFormatter.format(row.default_cost ?? 0)}
        </span>
      ),
      sortFn: (row) => row.default_cost ?? 0,
      defaultSort: "desc",
      align: "right",
      className: "w-[140px]",
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={(event) => {
              event.stopPropagation()
              onEdit(row)
            }}
            aria-label={`Edit ${row.name}`}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation()
              onDelete(row)
            }}
            aria-label={`Delete ${row.name}`}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      ),
      align: "right",
      className: "w-[120px]",
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={materials}
      rowKey={(row) => row.id}
      density="comfortable"
      isLoading={isLoading}
      sort={sort}
      onSortChange={setSort}
      onRowClick={(row) => onEdit(row)}
      empty={
        <EmptyState
          variant="blank"
          title="No materials yet"
          description="Add your first material type to start tracking inventory."
          primaryAction={<Button onClick={onAddNew}>Add material</Button>}
        />
      }
    />
  )
}
