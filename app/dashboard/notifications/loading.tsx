import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { Skeleton } from "@/app/components/ui/skeleton"

export default function NotificationsLoading() {
  return (
    <PageShell variant="overview">
      <PageHeader
        crumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Notifications" }]}
        title="Notifications"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-72 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      <div className="rounded-lg border p-4">
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full max-w-md" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
