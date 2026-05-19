import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Trust & Security is a content page: header + trust signals row
 * + FAQ accordion sections in a 2-column layout (FAQs + TOC nav).
 * Skeleton mirrors that shape.
 */
export default function SecurityLoading() {
  return (
    <PageShell variant="overview" spacing="default">
      <PageHeader
        title="Trust & Security"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-96 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border p-4">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 space-y-8">
          {Array.from({ length: 4 }).map((_, sectionIdx) => (
            <div key={sectionIdx} className="space-y-4 rounded-lg border p-6">
              <Skeleton className="h-6 w-48" />
              {Array.from({ length: 3 }).map((__, faqIdx) => (
                <div key={faqIdx} className="space-y-2 border-t pt-3 first:border-0 first:pt-0">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="space-y-2 rounded-lg border p-4">
          <Skeleton className="mb-3 h-4 w-24" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
      </div>
    </PageShell>
  )
}
