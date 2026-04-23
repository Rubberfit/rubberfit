"use client"

import { useMemo, useState, useCallback } from "react"
import { WorkspaceColumn, WorkspaceRow } from "@/app/components/patterns/workspace-column"
import type { CutHistory, MaterialType } from "@/src/infrastructure/models/supabase"
import type { PartTemplate } from "./PresetDimensionSelector"
import type { StockConfig } from "./stock-preview-configurator"
import type { SimpleCutDirection } from "./NestingVisualizer"
import type { SimpleCutMetrics } from "./nesting-visualizer-types"
import type { LayoutModel, PlacedPart, RenderShape } from "./layout-model"
import { PartsQueuePanel, type PartsFilter } from "./parts-queue-panel"
import { CanvasToolbar } from "./canvas-toolbar"
import { StrategyResultsPanel } from "./strategy-results-panel"
import KonvaSheetRenderer from "./KonvaSheetRenderer"

/** Single placement on the Free-roam canvas. Position is in sheet inches. */
interface ManualPlacement {
  /** Unique instance id. */
  id: string
  /** References a `PartTemplate.id` in the parts queue. */
  templateId: string
  x: number
  y: number
  rotationRad: number
}

function templateToRenderShape(type: string): RenderShape {
  switch (type) {
    case "cylinder":
      return "circle"
    case "cone":
      return "sector"
    case "trapezoid":
      return "trapezoid"
    default:
      return "rect"
  }
}

/**
 * Build the LayoutModel the Konva renderer consumes from the current
 * parts queue + manual placements. Templates are looked up once;
 * placements missing a template (e.g. after template deletion) are
 * skipped rather than throwing — the operator doesn't need a stack
 * trace for a detached placement.
 */
function buildFreeRoamLayout(
  placements: ManualPlacement[],
  parts: PartTemplate[],
  stock: StockConfig,
  tagByTemplateId: Map<string, string>
): LayoutModel {
  const byId = new Map(parts.map((p) => [p.id, p]))
  let specIndex = 0
  const indexByTemplate = new Map<string, number>()
  const mappedParts: PlacedPart[] = []
  for (const placement of placements) {
    const template = byId.get(placement.templateId)
    if (!template) continue
    if (!indexByTemplate.has(template.id)) {
      indexByTemplate.set(template.id, specIndex++)
    }
    const idx = indexByTemplate.get(template.id) ?? 0
    const width = template.width ?? template.diameter ?? 12
    const height = template.length ?? template.height ?? template.diameter ?? 12
    mappedParts.push({
      id: placement.id,
      shapeId: template.id,
      partNumber: template.partNumber,
      label: tagByTemplateId.get(template.id) ?? template.label,
      renderShape: templateToRenderShape(template.partType),
      specIndex: idx,
      x: placement.x,
      y: placement.y,
      rotationRad: placement.rotationRad,
      width,
      height,
      diameter: template.diameter,
      topWidth: template.topWidth,
      bottomWidth: template.bottomWidth,
      innerRadius: template.innerRadius,
      outerRadius: template.outerRadius,
      arcDegrees: template.arcDegrees,
    })
  }
  return {
    sheetWidth: stock.width,
    sheetLength: stock.length,
    parts: mappedParts,
    offcuts: [],
    scrap: [],
    placedCount: mappedParts.length,
    overflowCount: 0,
    usedAreaSqFt: 0,
    reusableAreaSqFt: 0,
    scrapAreaSqFt: 0,
    fabScore: 0,
    source: "ts-nfp",
  }
}

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
  const [placements, setPlacements] = useState<ManualPlacement[]>([])

  // Tag map — A / B / C / … per template so the canvas labels match
  // the parts queue. Uses partNumber when set (e.g. RF-000042), else
  // generated letters in selection order.
  const tagByTemplateId = useMemo(() => {
    const map = new Map<string, string>()
    let fallbackIdx = 0
    for (const part of parts) {
      if (part.partNumber) {
        map.set(part.id, part.partNumber)
      } else {
        let n = fallbackIdx++
        let tag = ""
        do {
          tag = String.fromCharCode(65 + (n % 26)) + tag
          n = Math.floor(n / 26) - 1
        } while (n >= 0)
        map.set(part.id, tag)
      }
    }
    return map
  }, [parts])

  const placedCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of placements) {
      counts[p.templateId] = (counts[p.templateId] ?? 0) + 1
    }
    return counts
  }, [placements])

  const handleAddInstance = useCallback(
    (part: PartTemplate) => {
      setPlacements((prev) => [
        ...prev,
        {
          id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          templateId: part.id,
          // Seed new instances at the sheet origin; drag to move
          // lands in C11c. Small rightward offset per new instance so
          // back-to-back clicks don't stack invisibly on top of each
          // other.
          x: Math.min(stock.width - 1, prev.length * 2),
          y: 0,
          rotationRad: 0,
        },
      ])
    },
    [stock.width]
  )

  const layout = useMemo(
    () => buildFreeRoamLayout(placements, parts, stock, tagByTemplateId),
    [placements, parts, stock, tagByTemplateId]
  )

  const handlePartDragEnd = useCallback(
    (partId: string, xIn: number, yIn: number) => {
      setPlacements((prev) =>
        prev.map((p) => {
          if (p.id !== partId) return p
          // Clamp to sheet bounds so a heavy drag doesn't fling the
          // part off-sheet. Snap to grid + collision land in C11d.
          const template = parts.find((t) => t.id === p.templateId)
          const partW = template?.width ?? template?.diameter ?? 12
          const partH = template?.length ?? template?.height ?? template?.diameter ?? 12
          const clampedX = Math.max(0, Math.min(stock.width - partW, xIn))
          const clampedY = Math.max(0, Math.min(stock.length - partH, yIn))
          return { ...p, x: clampedX, y: clampedY }
        })
      )
    },
    [parts, stock.width, stock.length]
  )

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      <WorkspaceRow className="min-h-[560px]">
        <WorkspaceColumn column="left">
          <PartsQueuePanel
            parts={parts}
            activeFilter={partsFilter}
            onFilterChange={setPartsFilter}
            placedCounts={placedCounts}
            onAddInstance={handleAddInstance}
          />
        </WorkspaceColumn>

        <WorkspaceColumn column="center">
          <div className="flex h-full flex-col">
            <CanvasToolbar />
            <div className="relative flex-1 bg-muted/10">
              <KonvaSheetRenderer layout={layout} onPartDragEnd={handlePartDragEnd} />
              {parts.length === 0 ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                  <div className="rounded-md border border-border/60 bg-background/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                    Add parts from the queue to start.
                  </div>
                </div>
              ) : placements.length === 0 ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                  <div className="rounded-md border border-border/60 bg-background/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                    Click a part in the queue to place an instance. Drag to move. Snap + collision
                    land in C11d.
                  </div>
                </div>
              ) : null}
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
