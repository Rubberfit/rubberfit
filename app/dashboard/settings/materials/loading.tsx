import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { LoadingTable } from "@/app/components/patterns/loading-table"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Phase 6 PR 2 override — settings/materials is a dense table
 * (material types catalog), not the form variant the parent
 * settings/loading paints. Without this file, navigating to the
 * Materials settings tab briefly flashes a form skeleton.
 */
export default function SettingsMaterialsLoading() {
  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "Materials" }]}
        title="Materials"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-96 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      <div className="mb-4 flex items-center gap-3 rounded-lg border bg-card p-3">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <LoadingTable rows={6} columnWidths={[30, 20, 20, 20, 10]} />
    </PageShell>
  )
}
