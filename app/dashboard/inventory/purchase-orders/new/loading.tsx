import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Phase 6 PR 2 override — PO create form is variant="form" via
 * `PoFormShell`. Skeleton card order + sticky-footer shape mirror
 * `po-form-shell.tsx` exactly: OrderDetails → LineItems →
 * Addresses → Notes → (summary, omitted while empty) → sticky
 * footer. Without this file, the parent inventory/loading paints
 * a dense skeleton briefly during navigation.
 */
export default function NewPurchaseOrderLoading() {
  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Purchase Orders", href: "/dashboard/inventory/purchase-orders" },
          { label: "New" },
        ]}
        title="New purchase order"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-80 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      <div className="space-y-6 pb-24">
        {/* OrderDetails */}
        <div className="space-y-6 rounded-lg border p-6">
          <Skeleton className="h-5 w-32" />
          <div className="grid gap-6 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
        {/* LineItems */}
        <div className="space-y-3 rounded-lg border p-6">
          <Skeleton className="h-5 w-24" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Skeleton className="col-span-4 h-9 rounded-md" />
                <Skeleton className="col-span-2 h-9 rounded-md" />
                <Skeleton className="col-span-2 h-9 rounded-md" />
                <Skeleton className="col-span-2 h-9 rounded-md" />
                <Skeleton className="col-span-2 h-9 rounded-md" />
              </div>
            ))}
          </div>
        </div>
        {/* Addresses */}
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-6">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
        {/* Notes */}
        <div className="space-y-3 rounded-lg border p-6">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
      </div>
      {/* Sticky footer — full-width with a top border, mirrors po-form-shell.tsx */}
      <div className="sticky bottom-0 -mx-6 mt-6 flex justify-end gap-2 border-t bg-card px-6 py-4 sm:-mx-8 sm:px-8">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
    </PageShell>
  )
}
