import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { LoadingTable } from "@/app/components/patterns/loading-table"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Phase 6 PR 2 override — materials/types is variant="overview" but
 * its body is mostly a table (the material catalog list), so the
 * overview shell + a dense-table body is the closest match. Without
 * this file, the parent inventory/loading paints a wider dense shell
 * with column proportions that mismatch the actual table.
 */
export default function MaterialsTypesLoading() {
  return (
    <PageShell variant="overview">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Materials", href: "/dashboard/inventory/materials" },
          { label: "Types" },
        ]}
        title="Material Types"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-80 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      <div className="mb-4 flex items-center gap-3 rounded-lg border bg-card p-3">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <LoadingTable rows={6} columnWidths={[30, 20, 20, 15, 15]} />
    </PageShell>
  )
}
