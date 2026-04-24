"use client"

import { Scissors } from "lucide-react"
import { Button } from "@/app/components/ui/button"
import type { CutHistory } from "@/src/infrastructure/models/supabase"
import type { StockConfig } from "./stock-preview-configurator"
import type { SimpleCutMetrics } from "./nesting-visualizer-types"
import { RecordedCutSelect } from "./recorded-cut-select"
import { ResultsBreakdown } from "./results-breakdown"
import { FreeRoamStockEditor } from "./free-roam-stock-editor"

interface SavedLayoutsRailProps {
  stock: StockConfig
  onStockChange: (stock: StockConfig) => void
  cutMetrics: SimpleCutMetrics | null
  onRecordCut: () => void
  isRecordingCut: boolean
  refreshKey: number
  onLoadCut: (cut: CutHistory) => void
}

/**
 * Free-roam right column. Replaces StrategyResultsPanel for the CAD
 * surface — no Quality picker (auto-pack is a deliberate action, not
 * a default), no Parameters card (free placement has no cut
 * direction). Surfaces:
 *   1. Stock editor (W × L × T)    — user configures the sheet
 *   2. Saved layouts dropdown       — filtered to source='manual'
 *   3. Results breakdown            — identical to Auto nest
 *   4. Cut button                   — unchanged, records the manual cut
 *
 * The Quality picker will come back later as a contextual control
 * when/if the user triggers an auto-pack action from inside Free-roam.
 */
export function FreeRoamSavedLayoutsRail({
  stock,
  onStockChange,
  cutMetrics,
  onRecordCut,
  isRecordingCut,
  refreshKey,
  onLoadCut,
}: SavedLayoutsRailProps) {
  return (
    <div className="flex flex-col gap-0 h-full">
      <div className="px-4 pt-4 pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Saved layouts</span>
          <RecordedCutSelect
            onLoad={onLoadCut}
            refreshKey={refreshKey}
            sourceFilter="manual"
            placeholder="Load saved layout…"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Stock
          </p>
          <FreeRoamStockEditor stock={stock} onChange={onStockChange} />
        </section>

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
