import { PageShell } from "@/app/components/patterns/page-shell"
import { PageHeader } from "@/app/components/patterns/page-header"
import { Skeleton } from "@/app/components/ui/skeleton"

export default function GasketCuttingLoading() {
  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Cutting Engine", href: "/dashboard/cutting-engine" },
          { label: "Gasket cutting" },
        ]}
        title="Gasket cutting"
        subtitle={
          <span
            className="bg-accent inline-block h-5 w-96 animate-pulse rounded-md"
            aria-hidden="true"
          />
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[20rem_1fr_20rem]">
        <Skeleton className="h-[560px] rounded-lg" />
        <Skeleton className="h-[560px] rounded-lg" />
        <Skeleton className="h-[560px] rounded-lg" />
      </div>
    </PageShell>
  )
}
