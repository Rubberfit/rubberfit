import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { LoadingTable } from "@/app/components/patterns/loading-table"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Dominant variant for `admin/security/page.tsx`. The real page
 * branches between `form`, `overview`, and `dense` based on the
 * loaded role state; we pick the most-common dense view for the
 * skeleton. A brief shape change on hydration when the actual
 * variant is form/overview is acceptable.
 */
export default function AdminSecurityLoading() {
  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Security" },
        ]}
        title="Security & Audit"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-80 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      <LoadingTable rows={6} columnWidths={[25, 25, 25, 25]} />
    </PageShell>
  )
}
