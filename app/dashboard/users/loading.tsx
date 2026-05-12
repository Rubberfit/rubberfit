import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { LoadingTable } from "@/app/components/patterns/loading-table"
import { Skeleton } from "@/app/components/ui/skeleton"

export default function UsersLoading() {
  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users" }]}
        title="Users"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-72 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      <div className="mb-4 flex items-center gap-3 rounded-lg border bg-card p-3">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <LoadingTable rows={8} columnWidths={[25, 25, 15, 15, 10, 10]} />
    </PageShell>
  )
}
