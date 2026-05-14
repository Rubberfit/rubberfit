"use client"

import { Recycle } from "lucide-react"

import type { RollReusableOffcutSummary } from "@/src/infrastructure/models/supabase"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import {
  getAreaUnitLabel,
  getDisplayAreaValue,
} from "@/src/application/preferences/user-unit-display"

interface RollDetailUsageProps {
  usage: RollReusableOffcutSummary | null
}

/**
 * Aggregated usage card — total reusable sqft / total scrap /
 * cut count — sourced from the per-roll cut history. Renders
 * nothing if no cuts have landed against this roll yet.
 */
export function RollDetailUsage({ usage }: RollDetailUsageProps) {
  const organizationPreferences = useOrganizationPreferences()
  if (!usage || usage.cut_count === 0) return null
  const areaUnit = getAreaUnitLabel(organizationPreferences)
  const displayArea = (value: number) =>
    getDisplayAreaValue(value, organizationPreferences).toFixed(1)

  return (
    <section className="border-b px-6 py-5">
      <div className="mb-3 flex items-center gap-2">
        <Recycle className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <h3 className="font-medium text-xs uppercase tracking-[0.12em] text-foreground">
          Usage history
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Reusable offcut
          </p>
          <p className="mt-1 font-semibold text-sm text-foreground tabular-nums">
            {displayArea(usage.total_reusable_sqft)}{" "}
            <span className="font-normal text-[11px] text-muted-foreground">{areaUnit}</span>
          </p>
        </div>
        <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Scrap
          </p>
          <p className="mt-1 font-semibold text-sm text-foreground tabular-nums">
            {displayArea(usage.total_scrap_sqft)}{" "}
            <span className="font-normal text-[11px] text-muted-foreground">{areaUnit}</span>
          </p>
        </div>
        <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Cuts
          </p>
          <p className="mt-1 font-semibold text-sm text-foreground">{usage.cut_count}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Totals aggregated from cuts made against this roll. Legacy cuts that predate roll linking
        aren&apos;t included.
      </p>
    </section>
  )
}
