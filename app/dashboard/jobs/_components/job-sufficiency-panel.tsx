"use client"

import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, ShoppingCart } from "lucide-react"

import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card } from "@/app/components/ui/card"
import type { JobMaterialSufficiency } from "@/src/infrastructure/services/jobService"
import { cn } from "@/app/lib/utils"

/**
 * Material-sufficiency readout for the job detail page. One row
 * per distinct material in the parts list. Green check when the
 * active inventory covers the needed square-footage; amber /red
 * alert with a "Create PO" deep-link when it doesn't.
 *
 * The PO deep-link carries `material` + `shortfall_sqft` + `job`
 * as query params so the PO creator can pre-populate the line
 * item — mirrors the reorder-suggestion → PO shortcut we already
 * have on the reorder page.
 */

interface JobSufficiencyPanelProps {
  jobId: string
  rows: JobMaterialSufficiency[]
}

export function JobSufficiencyPanel({ jobId, rows }: JobSufficiencyPanelProps) {
  const router = useRouter()

  const handleCreatePo = (material: string, shortfallSqft: number) => {
    const params = new URLSearchParams({
      job_id: jobId,
      material,
      shortfall_sqft: shortfallSqft.toFixed(2),
    })
    router.push(`/dashboard/inventory/purchase-orders?${params.toString()}`)
  }

  const shortfallCount = rows.filter((r) => r.shortfall_sqft > 0).length

  return (
    <section className="space-y-3">
      <header>
        <h2 className="font-semibold text-foreground text-base tracking-tight">
          Material sufficiency
        </h2>
        <p className="text-muted-foreground text-xs">
          {rows.length === 0
            ? "Add parts to compute a sufficiency check."
            : shortfallCount === 0
              ? "Inventory covers every material on this job."
              : `${shortfallCount} material${shortfallCount === 1 ? "" : "s"} short — create a PO to cover the gap.`}
        </p>
      </header>
      {rows.length === 0 ? null : (
        <Card className="gap-0 p-0 divide-y divide-border-subtle">
          {rows.map((row) => {
            const short = row.shortfall_sqft > 0
            return (
              <div
                key={row.material}
                className={cn(
                  "flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between",
                  short ? "bg-danger-bg/30" : undefined
                )}
              >
                <div className="flex items-start gap-3">
                  {short ? (
                    <AlertTriangle
                      className="mt-0.5 size-4 text-danger-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2
                      className="mt-0.5 size-4 text-success-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground text-sm">
                        {row.material}
                      </span>
                      {short ? (
                        <Badge
                          variant="outline"
                          className="border-danger-border bg-danger-bg text-danger-foreground text-[10px]"
                        >
                          Shortfall
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-success-border bg-success-bg text-success-foreground text-[10px]"
                        >
                          Covered
                        </Badge>
                      )}
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      Need {row.needed_sqft.toFixed(1)} sqft · Have{" "}
                      {row.available_sqft.toFixed(1)} sqft
                      {short && (
                        <span className="ml-1 text-danger-foreground">
                          · Short {row.shortfall_sqft.toFixed(1)} sqft
                        </span>
                      )}
                    </p>
                    {row.matching_rolls.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {row.matching_rolls.length} active roll
                        {row.matching_rolls.length === 1 ? "" : "s"}:{" "}
                        {row.matching_rolls
                          .slice(0, 3)
                          .map((r) => r.part_number ?? "—")
                          .join(", ")}
                        {row.matching_rolls.length > 3 ? ", …" : ""}
                      </p>
                    )}
                  </div>
                </div>
                {short && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      handleCreatePo(row.material, row.shortfall_sqft)
                    }
                    className="shrink-0"
                  >
                    <ShoppingCart className="size-3.5" />
                    Create PO
                  </Button>
                )}
              </div>
            )
          })}
        </Card>
      )}
    </section>
  )
}
