"use client"

import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Ruler, ShoppingCart } from "lucide-react"

import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card } from "@/app/components/ui/card"
import type { JobMaterialSufficiency } from "@/src/infrastructure/services/jobService"
import { cn } from "@/app/lib/utils"

/**
 * Material-sufficiency readout for the job detail page. One row
 * per distinct material in the parts list. Three distinct states,
 * shown in order of severity:
 *   - **Infeasible** — at least one part is wider than every roll
 *     of its material. No amount of sqft fixes it; a new roll class
 *     must be sourced.
 *   - **Shortfall** — width is fine but `needed_sqft > available_sqft`
 *     (after subtracting rolls reserved by other jobs). "Create PO"
 *     deep-links into the PO creator with the gap pre-filled.
 *   - **Covered** — inventory handles it.
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

type Severity = "infeasible" | "shortfall" | "covered"

function severityOf(row: JobMaterialSufficiency): Severity {
  if (row.infeasible_parts.length > 0) return "infeasible"
  if (row.shortfall_sqft > 0) return "shortfall"
  return "covered"
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

  const infeasibleCount = rows.filter((r) => r.infeasible_parts.length > 0).length
  const shortfallCount = rows.filter(
    (r) => r.infeasible_parts.length === 0 && r.shortfall_sqft > 0
  ).length

  const headerHint = (() => {
    if (rows.length === 0) return "Add parts to compute a sufficiency check."
    if (infeasibleCount > 0) {
      return `${infeasibleCount} material${infeasibleCount === 1 ? "" : "s"} blocked — parts wider than any roll on hand.`
    }
    if (shortfallCount > 0) {
      return `${shortfallCount} material${shortfallCount === 1 ? "" : "s"} short — create a PO to cover the gap.`
    }
    return "Inventory covers every material on this job."
  })()

  return (
    <section className="space-y-3">
      <header>
        <h2 className="font-semibold text-foreground text-base tracking-tight">
          Material sufficiency
        </h2>
        <p className="text-muted-foreground text-xs">{headerHint}</p>
      </header>
      {rows.length === 0 ? null : (
        <Card className="gap-0 p-0 divide-y divide-border-subtle">
          {rows.map((row) => {
            const severity = severityOf(row)
            const tint =
              severity === "infeasible"
                ? "bg-danger-bg/50"
                : severity === "shortfall"
                  ? "bg-danger-bg/30"
                  : undefined
            return (
              <div
                key={row.material}
                className={cn(
                  "flex flex-col gap-3 px-4 py-3 md:flex-row md:items-start md:justify-between",
                  tint
                )}
              >
                <div className="flex items-start gap-3">
                  {severity === "covered" ? (
                    <CheckCircle2
                      className="mt-0.5 size-4 text-success-foreground"
                      aria-hidden="true"
                    />
                  ) : severity === "infeasible" ? (
                    <Ruler
                      className="mt-0.5 size-4 text-danger-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertTriangle
                      className="mt-0.5 size-4 text-danger-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground text-sm">
                        {row.material}
                      </span>
                      {severity === "infeasible" ? (
                        <Badge
                          variant="outline"
                          className="border-danger-border bg-danger-bg text-danger-foreground text-[10px]"
                        >
                          Infeasible width
                        </Badge>
                      ) : severity === "shortfall" ? (
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
                      {row.shortfall_sqft > 0 && (
                        <span className="ml-1 text-danger-foreground">
                          · Short {row.shortfall_sqft.toFixed(1)} sqft
                        </span>
                      )}
                      {row.reserved_sqft > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          · {row.reserved_sqft.toFixed(1)} sqft reserved by other jobs
                        </span>
                      )}
                    </p>
                    {severity === "infeasible" && (
                      <p className="text-[11px] text-danger-foreground">
                        Widest part {row.max_required_width.toFixed(1)}" vs
                        widest roll {row.max_available_width.toFixed(1)}" —{" "}
                        {row.infeasible_parts.length} part
                        {row.infeasible_parts.length === 1 ? "" : "s"} can't be cut from stock:{" "}
                        {row.infeasible_parts
                          .slice(0, 3)
                          .map(
                            (p) =>
                              `${p.description ?? p.part_number ?? "part"} (${p.width.toFixed(1)}")`
                          )
                          .join(", ")}
                        {row.infeasible_parts.length > 3 ? ", …" : ""}
                      </p>
                    )}
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
                {(severity === "shortfall" || severity === "infeasible") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      handleCreatePo(
                        row.material,
                        // On pure infeasibility the sqft figure may be
                        // small (only the oversized parts). The PO
                        // creator still lets the operator hand-tune
                        // the line — deep-linking the material alone
                        // is the useful part.
                        row.shortfall_sqft > 0 ? row.shortfall_sqft : row.needed_sqft
                      )
                    }
                    className="shrink-0"
                  >
                    <ShoppingCart className="size-3.5" />
                    {severity === "infeasible" ? "Source new stock" : "Create PO"}
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
