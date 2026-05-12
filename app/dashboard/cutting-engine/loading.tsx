import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Cutting engine is the only workspace-variant page — heavy
 * interactive canvas (PR 3 SVG + PR 6 thumbnail strip) over a
 * part-picker + stock-config grid. Skeleton mirrors that 3-row
 * stack so hydration doesn't shift.
 */
export default function CuttingEngineLoading() {
  return (
    <PageShell variant="workspace">
      <PageHeader
        crumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Cutting engine" }]}
        title="Cutting engine"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-96 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      <div className="rounded-lg border p-4">
        <Skeleton className="h-96 w-full rounded-md" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <Skeleton className="mb-3 h-5 w-24" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <Skeleton className="mb-4 h-5 w-28" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
