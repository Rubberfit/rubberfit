"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { Scissors } from "lucide-react"
import { Button } from "@/app/components/ui/button"
import { cn } from "@/app/lib/utils"
import {
  StockPreviewConfigurator,
  STOCK_PRESETS,
  type StockConfig,
} from "./stock-preview-configurator"
import { CutConfigCard } from "./cut-config-card"
import { RecordedCutSelect } from "./recorded-cut-select"
import type { MaterialType, CutHistory } from "@/src/infrastructure/models/supabase"
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
  // Stock
  stock: StockConfig
  onStockChange: Dispatch<SetStateAction<StockConfig>>
  materialTypes: MaterialType[]
  activeStockPreset: string | null
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
  onStockChange,
  materialTypes,
  activeStockPreset,
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
  // Quality mode is A1 UI-only — wired to packing in A4.5
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

        {/* Stock */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Sheet
          </p>
          <StockPreviewConfigurator
            activeStockPreset={activeStockPreset ?? undefined}
            stock={stock}
            onStockChange={onStockChange}
            materialTypes={materialTypes}
          />
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
            <div className="space-y-1.5 text-xs">
              <ResultRow label="Utilization" value={`${cutMetrics.fabScore?.toFixed(0) ?? "—"}%`} accent />
              <ResultRow label="Parts placed" value={String(cutMetrics.partsCompleted ?? 0)} />
              <ResultRow
                label="Material used"
                value={`${cutMetrics.materialUsedSqFt?.toFixed(2) ?? "—"} sq ft`}
              />
              <ResultRow
                label="Reusable offcut"
                value={`${cutMetrics.reusableOffsetSqFt?.toFixed(2) ?? "—"} sq ft`}
              />
              <ResultRow
                label="Waste"
                value={`${cutMetrics.scrapSqFt?.toFixed(2) ?? "—"} sq ft`}
              />
            </div>

            {/* Material used bar */}
            {cutMetrics.materialUsedSqFt !== undefined && stock.width > 0 && stock.length > 0 && (
              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${Math.min(100, ((cutMetrics.materialUsedSqFt ?? 0) / ((stock.width * stock.length) / 144)) * 100).toFixed(1)}%`,
                    }}
                  />
                </div>
              </div>
            )}

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

function ResultRow({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", accent && "text-emerald-600 dark:text-emerald-400")}>
        {value}
      </span>
    </div>
  )
}
