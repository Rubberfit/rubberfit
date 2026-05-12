import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { LoadingTable } from "@/app/components/patterns/loading-table"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Phase 6 PR 2 override — free-roam uses variant="dense" (a saved-
 * configurations table), not the workspace shell the parent
 * cutting-engine/loading paints. Without this file, navigating
 * from cutting-engine → free-roam briefly flashes a workspace
 * skeleton with a large preview canvas where the table belongs.
 */
export default function FreeRoamLoading() {
  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Cutting Engine", href: "/dashboard/cutting-engine" },
          { label: "Free roam" },
        ]}
        title="Free roam"
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
      <LoadingTable rows={6} columnWidths={[30, 25, 20, 15, 10]} />
    </PageShell>
  )
}
