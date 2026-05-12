import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { LoadingTable } from "@/app/components/patterns/loading-table"
import { Skeleton } from "@/app/components/ui/skeleton"

/**
 * Phase 6 PR 1 — route-segment loading skeleton for the inventory tree.
 *
 * Next.js wraps the segment in Suspense automatically; this file paints
 * instantly on every navigation INTO `/dashboard/inventory[/...]` so the
 * operator gets visible feedback the moment a sidebar link is clicked.
 *
 * `LoadingTable` (from `app/components/patterns/loading-table.tsx`) is
 * the canonical skeleton for any `<DataTable>`-shaped page. Reused
 * verbatim across jobs / users / history / admin-security — no helper
 * duplication.
 *
 * TODO(phase6-pr2): the inventory tree contains sub-routes that don't
 * fit the dense-table archetype:
 *   - `inventory/materials/page.tsx` (overview hub)
 *   - `inventory/materials/types/page.tsx` (overview)
 *   - `inventory/purchase-orders/new/page.tsx` (form)
 *   - `inventory/purchase-orders/[id]/edit/page.tsx` (form)
 * These currently flash this dense skeleton for ~150-300ms before
 * the leaf renders. Add per-leaf `loading.tsx` overrides in the
 * follow-up PR if the flash is noticeable in production.
 */
export default function InventoryLoading() {
  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Inventory" }]}
        title="Inventory"
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
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
      <LoadingTable rows={8} columnWidths={[25, 20, 15, 15, 15, 10]} />
      <div className="mt-4 flex items-center justify-end gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-8" />
      </div>
    </PageShell>
  )
}
