import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { LoadingTable } from "@/app/components/patterns/loading-table"
import { Skeleton } from "@/app/components/ui/skeleton"

export default function JobsLoading() {
  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Jobs" }]}
        title="Jobs"
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
      </div>
      <LoadingTable rows={8} columnWidths={[25, 20, 20, 15, 20]} />
    </PageShell>
  )
}
