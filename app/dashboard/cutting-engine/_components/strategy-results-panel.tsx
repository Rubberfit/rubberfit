"use client"

import { useState } from "react"
import { Scissors } from "lucide-react"
import { Button } from "@/app/components/ui/button"
import { cn } from "@/app/lib/utils"
import { type StockConfig } from "./stock-preview-configurator"
import { CutConfigCard } from "./cut-config-card"
import { RecordedCutSelect } from "./recorded-cut-select"
import type { CutHistory } from "@/src/infrastructure/models/supabase"
import type { PartTemplate } from "./PresetDimensionSelector"
import type { SimpleCutDirection } from "./NestingVisualizer"
import type { SimpleCutMetrics } from "./nesting-visualizer-types"
import type { PackRequest } from "@/src/application/packing/types"

type PackMode = NonNullable<PackRequest["mode"]>

const QUALITY_STEPS: Array<{ mode: PackMode; label: string; caption: string }> = [
  { mode: "fast", label: "Fast", caption: "~1s · good enough" },
  { mode: "balanced", label: "Balanced", caption: "~5s · recommended" },
  { mode: "thorough", label: "Thorough", caption: "~20s · best" },
]

interface StrategyResultsPanelProps {
  /** Stock geometry — read-only here; editor lives above the tabs. */
  stock: StockConfig
  // Cut config
  selectedTemplate: PartTemplate | null
  selectedTemplates: PartTemplate[]
  safeQuantity: number
  cutDirection: SimpleCutDirection
  setCutDirection: (d: SimpleCutDirection) => void
  customCutRatioInput: string
  setCustomCutRatioInput: (v: string) => void
  customCutRatios: number[] | undefined
  requestedSqFt: number
  // Results
  cutMetrics: SimpleCutMetrics | null
  onRecordCut: () => void
  isRecordingCut: boolean
  // History
  refreshKey: number
  onLoadCut: (cut: CutHistory) => void
}

export function StrategyResultsPanel({
  stock,
  selectedTemplate,
  selectedTemplates,
  safeQuantity,
  cutDirection,
  setCutDirection,
  customCutRatioInput,
  setCustomCutRatioInput,
  customCutRatios,
  requestedSqFt,
  cutMetrics,
  onRecordCut,
  isRecordingCut,
  refreshKey,
  onLoadCut,
}: StrategyResultsPanelProps) {
  // Quality mode is scaffold-only. Wiring to PackRequest lands in C8.
  const [packMode, setPackMode] = useState<PackMode>("balanced")

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Strategy &amp; results</span>
          <RecordedCutSelect onLoad={onLoadCut} refreshKey={refreshKey} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Quality section */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Quality
          </p>
          <div className="flex rounded-md border border-border/60 overflow-hidden">
            {QUALITY_STEPS.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPackMode(mode)}
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium transition-colors",
                  packMode === mode
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted/60"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground text-center">
            {QUALITY_STEPS.find((s) => s.mode === packMode)?.caption}
          </p>
        </section>

        {/* Cut config */}
        {selectedTemplate && (
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Parameters
            </p>
            <CutConfigCard
              selectedTemplate={selectedTemplate}
              selectedTemplates={selectedTemplates}
              safeQuantity={safeQuantity}
              cutDirection={cutDirection}
              setCutDirection={setCutDirection}
              customCutRatioInput={customCutRatioInput}
              setCustomCutRatioInput={setCustomCutRatioInput}
              customCutRatios={customCutRatios}
              requestedSqFt={requestedSqFt}
            />
          </section>
        )}

        {/* Results */}
        {cutMetrics && (
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Results
            </p>
            <ResultsBreakdown cutMetrics={cutMetrics} stock={stock} />

            {(cutMetrics.partsCompleted ?? 0) > 0 && (
              <Button
                size="sm"
                onClick={onRecordCut}
                disabled={isRecordingCut}
                className="mt-4 w-full"
              >
                <Scissors className="mr-1.5 h-4 w-4" />
                {isRecordingCut ? "Recording…" : "Cut"}
              </Button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

type ResultTone = "neutral" | "utilization" | "reusable" | "waste"

const TONE_CLASS: Record<ResultTone, string> = {
  neutral: "text-foreground",
  utilization: "text-emerald-600 dark:text-emerald-400",
  reusable: "text-amber-600 dark:text-amber-400",
  waste: "text-red-600 dark:text-red-400",
}

const TONE_DOT: Record<ResultTone, string> = {
  neutral: "",
  utilization: "bg-emerald-500",
  reusable: "bg-amber-500",
  waste: "bg-red-500",
}

function ResultRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: ResultTone
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {tone !== "neutral" && (
          <span aria-hidden className={cn("inline-block h-2 w-2 rounded-full", TONE_DOT[tone])} />
        )}
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className={cn("font-medium tabular-nums", TONE_CLASS[tone])}>{value}</span>
    </div>
  )
}

function ResultsBreakdown({
  cutMetrics,
  stock,
}: {
  cutMetrics: SimpleCutMetrics
  stock: StockConfig
}) {
  const hasFabrication = (cutMetrics.partsCompleted ?? 0) > 0
  const totalSqFt = (stock.width * stock.length) / 144
  const used = cutMetrics.materialUsedSqFt ?? 0
  const reusable = cutMetrics.reusableOffsetSqFt ?? 0
  const waste = cutMetrics.scrapSqFt ?? 0
  const pct = (n: number) => (totalSqFt > 0 ? ((n / totalSqFt) * 100).toFixed(1) : "0.0")
  // fabScore is normalized 0-1 from NestingVisualizer; display as 0-100.
  const utilization = Math.round((cutMetrics.fabScore ?? 0) * 100)
  const usedBarPct = totalSqFt > 0 ? Math.min(100, (used / totalSqFt) * 100).toFixed(1) : "0"

  return (
    <>
      <div className="space-y-1.5 text-xs">
        <ResultRow
          label="Utilization"
          value={hasFabrication ? `${utilization}%` : "—"}
          tone="utilization"
        />
        <ResultRow label="Parts placed" value={String(cutMetrics.partsCompleted ?? 0)} />
        <ResultRow label="Material used" value={`${used.toFixed(2)} sq ft`} />
        <ResultRow
          label="Reusable offcut"
          value={`${reusable.toFixed(2)} sq ft (${pct(reusable)}%)`}
          tone="reusable"
        />
        <ResultRow
          label="Waste"
          value={`${waste.toFixed(2)} sq ft (${pct(waste)}%)`}
          tone="waste"
        />
      </div>

      {totalSqFt > 0 && (
        <div className="mt-3">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-emerald-500" style={{ width: `${usedBarPct}%` }} />
            <div className="h-full bg-amber-500" style={{ width: `${pct(reusable)}%` }} />
            <div className="h-full bg-red-500" style={{ width: `${pct(waste)}%` }} />
          </div>
        </div>
      )}
    </>
  )
}
