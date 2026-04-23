"use client"

import { useState } from "react"
import { Shapes } from "lucide-react"
import { WorkspaceColumn, WorkspaceRow } from "@/app/components/patterns/workspace-column"
import type { CutHistory, MaterialType } from "@/src/infrastructure/models/supabase"
import type { PartTemplate } from "./PresetDimensionSelector"
import type { StockConfig } from "./stock-preview-configurator"
import type { SimpleCutDirection } from "./NestingVisualizer"
import type { SimpleCutMetrics } from "./nesting-visualizer-types"
import { PartsQueuePanel, type PartsFilter } from "./parts-queue-panel"
import { CanvasToolbar } from "./canvas-toolbar"
import { StrategyResultsPanel } from "./strategy-results-panel"

/**
 * Free-roam tab content — three-column CAD-style workspace. Phase A
 * is the scaffold: shared parts queue on the left, canvas placeholder
 * in the center, strategy + results panel on the right. Drag / drop,
 * snap, and real algorithm wiring land in C9 — C11.
 *
 * Parts + stock are shared with the Auto nest tab (owned by the
 * cutting-engine page). Placements will be per-tab once the canvas
 * is wired.
 */
interface FreeRoamContentProps {
  parts: PartTemplate[]
  stock: StockConfig
  materialTypes: MaterialType[]
  activeStockPreset: string | null
  selectedTemplate: PartTemplate | null
  selectedTemplates: PartTemplate[]
  safeQuantity: number
  cutDirection: SimpleCutDirection
  setCutDirection: (d: SimpleCutDirection) => void
  customCutRatioInput: string
  setCustomCutRatioInput: (v: string) => void
  customCutRatios: number[] | undefined
  requestedSqFt: number
  cutMetrics: SimpleCutMetrics | null
  onRecordCut: () => void
  isRecordingCut: boolean
  refreshKey: number
  onLoadCut: (cut: CutHistory) => void
}

export default function FreeRoamContent({
  parts,
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
}: FreeRoamContentProps) {
  const [partsFilter, setPartsFilter] = useState<PartsFilter>("all")

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      <WorkspaceRow className="min-h-[560px]">
        <WorkspaceColumn column="left">
          <PartsQueuePanel
            parts={parts}
            activeFilter={partsFilter}
            onFilterChange={setPartsFilter}
          />
        </WorkspaceColumn>

        <WorkspaceColumn column="center">
          <div className="flex h-full flex-col">
            <CanvasToolbar />
            <div className="flex flex-1 items-center justify-center bg-muted/20 p-8 text-center text-muted-foreground">
              <div className="flex max-w-sm flex-col items-center gap-3">
                <Shapes className="h-12 w-12 opacity-30" aria-hidden="true" />
                <p className="text-sm">
                  Free-roam canvas coming online in C11 — drag parts from the queue, snap to grid,
                  rotate with R, commit the layout as a cut.
                </p>
                <p className="text-[11px] text-muted-foreground/80">
                  Stock: {stock.width}″ × {stock.length}″ × {stock.thickness}″
                </p>
              </div>
            </div>
          </div>
        </WorkspaceColumn>

        <WorkspaceColumn column="right" scroll="y">
          <StrategyResultsPanel
            stock={stock}
            selectedTemplate={selectedTemplate}
            selectedTemplates={selectedTemplates}
            safeQuantity={safeQuantity}
            cutDirection={cutDirection}
            setCutDirection={setCutDirection}
            customCutRatioInput={customCutRatioInput}
            setCustomCutRatioInput={setCustomCutRatioInput}
            customCutRatios={customCutRatios}
            requestedSqFt={requestedSqFt}
            cutMetrics={cutMetrics}
            onRecordCut={onRecordCut}
            isRecordingCut={isRecordingCut}
            refreshKey={refreshKey}
            onLoadCut={onLoadCut}
          />
        </WorkspaceColumn>
      </WorkspaceRow>
    </div>
  )
}
