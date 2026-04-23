"use client"

import { useMemo, useState } from "react"
import { WorkspaceColumn, WorkspaceRow } from "@/app/components/patterns/workspace-column"
import type { CutHistory, MaterialType } from "@/src/infrastructure/models/supabase"
import type { PartTemplate } from "./PresetDimensionSelector"
import type { StockConfig } from "./stock-preview-configurator"
import type { SimpleCutDirection } from "./NestingVisualizer"
import type { SimpleCutMetrics } from "./nesting-visualizer-types"
import type { LayoutModel } from "./layout-model"
import { PartsQueuePanel, type PartsFilter } from "./parts-queue-panel"
import { CanvasToolbar } from "./canvas-toolbar"
import { StrategyResultsPanel } from "./strategy-results-panel"
import KonvaSheetRenderer from "./KonvaSheetRenderer"

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

  // Empty LayoutModel renders just the sheet + grid. Placements come
  // online in C11b (click-to-add) and C11c (drag interactions).
  const emptyLayout = useMemo<LayoutModel>(
    () => ({
      sheetWidth: stock.width,
      sheetLength: stock.length,
      parts: [],
      offcuts: [],
      scrap: [],
      placedCount: 0,
      overflowCount: 0,
      usedAreaSqFt: 0,
      reusableAreaSqFt: 0,
      scrapAreaSqFt: 0,
      fabScore: 0,
      source: "ts-nfp",
    }),
    [stock.width, stock.length]
  )

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
            <div className="relative flex-1 bg-muted/10">
              <KonvaSheetRenderer layout={emptyLayout} />
              {parts.length === 0 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                  <div className="rounded-md border border-border/60 bg-background/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                    Add parts from the queue to start. Drag &amp; drop lands in C11b.
                  </div>
                </div>
              )}
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
