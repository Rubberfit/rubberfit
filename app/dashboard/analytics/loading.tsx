import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Covers every analytics sub-route (waste, costs, usage, trends,
 * waste-comparison, reports). All have the same shape: filter
 * toolbar (date range + segment), KPI card grid, then 1-2 chart
 * panels. The redirect index (`analytics/page.tsx`) bypasses this
 * file via `redirect()` so no skeleton renders for the bare URL.
 */
export default function AnalyticsLoading() {
  return (
    <PageShell variant="overview">
      <PageHeader
        crumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Analytics" }]}
        title="Analytics"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-80 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-40 rounded-md" />
        <Skeleton className="h-9 w-40 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6">
            <Skeleton className="mb-3 h-4 w-20" />
            <Skeleton className="mb-3 h-8 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex h-80 flex-col rounded-lg border p-4">
            <Skeleton className="mb-4 h-5 w-32" />
            <Skeleton className="w-full flex-1 rounded-md" />
          </div>
        ))}
      </div>
    </PageShell>
  )
}
