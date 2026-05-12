import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Phase 6 PR 2 override — materials hub is variant="overview" (a list
 * of category cards), not the dense table the parent inventory/loading
 * paints. Without this file, navigating from /dashboard/inventory →
 * /dashboard/inventory/materials briefly flashes a dense skeleton.
 */
export default function MaterialsHubLoading() {
  return (
    <PageShell variant="overview">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Materials" },
        ]}
        title="Materials"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-80 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6">
            <Skeleton className="mb-3 h-5 w-32" />
            <Skeleton className="mb-2 h-3 w-full" />
            <Skeleton className="mb-4 h-3 w-3/4" />
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        ))}
      </div>
    </PageShell>
  )
}
