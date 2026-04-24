"use client"

import { ExternalLink, Scissors } from "lucide-react"

import { Card } from "@/app/components/ui/card"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

/**
 * Cuts recorded against this job (`cut_history.job_id`). Surfaces
 * the fab score + sqft summary per cut, with a deep-link to the
 * generated PDF when one was uploaded. Layout diagrams live in
 * the cut history surface — this panel stays metric-focused by
 * design (customer-facing data stays layout-free).
 */

interface JobCutsPanelProps {
  cuts: CutHistory[]
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString()
}

export function JobCutsPanel({ cuts }: JobCutsPanelProps) {
  return (
    <section className="space-y-3">
      <header>
        <h2 className="font-semibold text-foreground text-base tracking-tight">
          Cuts recorded
        </h2>
        <p className="text-muted-foreground text-xs">
          {cuts.length === 0
            ? "No cuts linked to this job yet."
            : `${cuts.length} cut${cuts.length === 1 ? "" : "s"} recorded against this job.`}
        </p>
      </header>
      {cuts.length > 0 && (
        <Card className="gap-0 p-0 divide-y divide-border-subtle">
          {cuts.map((cut) => (
            <div key={cut.id} className="flex items-center gap-3 px-4 py-3">
              <Scissors
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="flex items-center gap-2 text-foreground text-sm">
                  <span>{cut.stock_label ?? `Cut #${cut.id}`}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {formatDateTime(cut.cut_date)}
                  </span>
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {cut.material_used_sqft.toFixed(1)} sqft used ·{" "}
                  {cut.reusable_offset_sqft.toFixed(1)} reusable ·{" "}
                  {cut.scrap_sqft.toFixed(1)} scrap · fab{" "}
                  {(cut.fab_score * 100).toFixed(0)}/100
                </p>
              </div>
              {cut.pdf_url && (
                <a
                  href={cut.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground text-[11px]"
                >
                  PDF
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}
            </div>
          ))}
        </Card>
      )}
    </section>
  )
}
