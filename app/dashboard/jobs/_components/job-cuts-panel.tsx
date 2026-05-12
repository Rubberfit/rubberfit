"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Loader2, Scissors } from "lucide-react"

import { Card } from "@/app/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/components/ui/tooltip"
import { canViewPdf } from "@/app/dashboard/history/_components/use-cut-history"
import { useRegenerateCutPdf } from "@/app/hooks/use-regenerate-cut-pdf"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

/**
 * Cuts recorded against this job (`cut_history.job_id`). Surfaces
 * the fab score + sqft summary per cut, with a deep-link to the
 * generated PDF when one was uploaded. Layout diagrams live in
 * the cut history surface — this panel stays metric-focused by
 * design (customer-facing data stays layout-free).
 *
 * Issue #127: PDF link is always rendered when the row has either a
 * stored URL or a recoverable layout snapshot. The first click on a
 * recoverable row hits `POST /api/cuts/history/[id]/pdf` to regenerate
 * and persist the URL, then opens it.
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

export function JobCutsPanel({ cuts: initialCuts }: JobCutsPanelProps) {
  // Track regenerated `pdf_url` per row separately from the prop, so we
  // don't reset on parent re-render. Map of cutId → fresh URL.
  const [pdfUrlOverrides, setPdfUrlOverrides] = useState<Record<string, string>>({})
  const { pendingIds, regenerate } = useRegenerateCutPdf()

  // Drop overrides whose value is now in the prop (parent refetched).
  useEffect(() => {
    setPdfUrlOverrides((prev) => {
      let changed = false
      const next: Record<string, string> = {}
      for (const [id, url] of Object.entries(prev)) {
        const incoming = initialCuts.find((c) => c.id === id)
        if (incoming?.pdf_url === url) {
          changed = true
          continue
        }
        next[id] = url
      }
      return changed ? next : prev
    })
  }, [initialCuts])

  const cuts = initialCuts.map((c) => {
    const override = pdfUrlOverrides[c.id]
    return override ? { ...c, pdf_url: override } : c
  })

  async function openPdf(cut: CutHistory) {
    if (cut.pdf_url) {
      window.open(cut.pdf_url, "_blank", "noopener,noreferrer")
      return
    }
    const url = await regenerate(cut.id)
    if (!url) return
    setPdfUrlOverrides((prev) => ({ ...prev, [cut.id]: url }))
    window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <section className="space-y-3">
      <header>
        <h2 className="font-semibold text-foreground text-base tracking-tight">Cuts recorded</h2>
        <p className="text-muted-foreground text-xs">
          {cuts.length === 0
            ? "No cuts linked to this job yet."
            : `${cuts.length} cut${cuts.length === 1 ? "" : "s"} recorded against this job.`}
        </p>
      </header>
      {cuts.length > 0 && (
        <Card className="gap-0 p-0 divide-y divide-border-subtle">
          {cuts.map((cut) => {
            const isPending = pendingIds.has(cut.id)
            const recoverable = canViewPdf(cut)
            const tooltipLabel = cut.pdf_url
              ? "View PDF"
              : recoverable
                ? isPending
                  ? "Generating PDF…"
                  : "Generate PDF"
                : "PDF unavailable — no layout snapshot was stored for this cut"

            return (
              <div key={cut.id} className="flex items-center gap-3 px-4 py-3">
                <Scissors className="size-4 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex items-center gap-2 text-foreground text-sm">
                    <span>{cut.stock_label ?? `Cut #${cut.id}`}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatDateTime(cut.cut_date)}
                    </span>
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {cut.material_used_sqft.toFixed(1)} sqft used ·{" "}
                    {cut.reusable_offset_sqft.toFixed(1)} reusable · {cut.scrap_sqft.toFixed(1)}{" "}
                    scrap · fab {(cut.fab_score * 100).toFixed(0)}/100
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <button
                        type="button"
                        onClick={() => openPdf(cut)}
                        disabled={!recoverable || isPending}
                        className="inline-flex items-center gap-1 text-muted-foreground enabled:hover:text-foreground text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={tooltipLabel}
                      >
                        {isPending ? "Generating…" : "PDF"}
                        {isPending ? (
                          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <ExternalLink className="size-3" aria-hidden="true" />
                        )}
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{tooltipLabel}</TooltipContent>
                </Tooltip>
              </div>
            )
          })}
        </Card>
      )}
    </section>
  )
}
