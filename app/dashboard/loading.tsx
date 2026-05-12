import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Phase 6 PR 1 — route-segment loading skeleton for `/dashboard`.
 *
 * Next.js wraps the segment in Suspense automatically; this file
 * paints instantly on every navigation INTO this segment so operators
 * get visible feedback the moment a sidebar link is clicked, instead
 * of the previous "tab is unresponsive until the page finishes
 * loading" gap. Closest-ancestor `loading.tsx` wins, so this file
 * also fallbacks for any sub-route that doesn't ship its own.
 *
 * Crumbs and title stay as real text (static, preserves wayfinding
 * continuity). Subtitle and body are skeletons. The body shape
 * mirrors `app/dashboard/page.tsx`: SummaryCards (4 stat tiles) →
 * 2-col grid (utilization chart + recent cuts table) → activity
 * sidebar — so hydration produces no layout shift.
 */
export default function DashboardLoading() {
  return (
    <PageShell variant="overview">
      <PageHeader
        eyebrow={<Skeleton className="h-4 w-24" />}
        title="Operations overview"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-64 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      {/* SummaryCards — 4 stat tiles with sparkline */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6">
            <Skeleton className="mb-3 h-4 w-24" />
            <Skeleton className="mb-3 h-8 w-32" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </div>
      {/* UtilizationCard + RecentCutsCard */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <Skeleton className="mb-4 h-5 w-40" />
          <Skeleton className="h-56 w-full rounded-md" />
        </div>
        <div className="rounded-lg border p-4">
          <Skeleton className="mb-4 h-5 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-3 flex-1 max-w-[60%]" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* DashboardSidebar — low stock + recent activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, sectionIdx) => (
          <div key={sectionIdx} className="rounded-lg border p-4">
            <Skeleton className="mb-4 h-5 w-36" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((__, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-3 flex-1 max-w-[70%]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
