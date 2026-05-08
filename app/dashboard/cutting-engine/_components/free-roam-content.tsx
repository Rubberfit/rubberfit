"use client"

import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import { WorkspaceColumn, WorkspaceRow } from "@/app/components/patterns/workspace-column"
import type { CutHistory } from "@/src/infrastructure/models/supabase"
import type { PartTemplate } from "./PresetDimensionSelector"
import type { StockConfig } from "./stock-preview-configurator"
import type { SimpleCutMetrics } from "./nesting-visualizer-types"
import { PartsQueuePanel, type PartsFilter } from "./parts-queue-panel"
import { CanvasToolbar } from "./canvas-toolbar"
import KonvaSheetRenderer from "./KonvaSheetRenderer"
import { useFreeRoamLayout } from "./use-free-roam-layout"
import { deriveManualMetrics } from "./free-roam-metrics"
import { useFreeRoamPlacements } from "./use-free-roam-placements"
import { FreeRoamSavedLayoutsRail } from "./free-roam-saved-layouts-rail"
import { useFreeRoamRegions } from "./use-free-roam-regions"
import { __dumpRegionTimings } from "./free-roam-regions"
import { useDragSnapshot } from "./use-drag-snapshot"
import { useRecordManualCut } from "./use-record-manual-cut"
import { useLoadManualCut } from "./use-load-manual-cut"
import { FreeRoamAddShapeDialog } from "./free-roam-add-shape-dialog"
import { CutLoader } from "./cut-loader"

/**
 * Dev-only: drains the per-stage timing sink and prints a `console.table`
 * + a one-line p95 / placement-range summary. Module-level so it doesn't
 * count toward the host component's line budget — and so the production
 * build can DCE it via `process.env.NODE_ENV !== "production"` at the
 * single call site below.
 */
function dumpRegionTimingsToConsole(): void {
  const samples = __dumpRegionTimings()
  if (samples.length === 0) {
    console.log("[arc-91] No region timing samples — drag a part to collect.")
    return
  }
  console.table(samples)
  const sortedTotal = [...samples].map((s) => s.totalMs).sort((a, b) => a - b)
  const p95Total = sortedTotal[Math.floor(sortedTotal.length * 0.95)] ?? 0
  const placementCounts = samples.map((s) => s.placementCount)
  console.log(
    `[arc-91] N=${samples.length} samples; p95 totalMs=${p95Total.toFixed(2)}; placement count range=${Math.min(...placementCounts)}-${Math.max(...placementCounts)}`
  )
}

/**
 * Dev-only floating button (top-right of the canvas) that dumps
 * collected per-stage region-compute timings to the console. Production
 * builds strip this entire component via the `process.env.NODE_ENV`
 * guard at its single call site.
 */
function DumpRegionTimingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-2 top-2 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-900 shadow-sm hover:bg-amber-100 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100"
    >
      Dump region timings
    </button>
  )
}

/**
 * Inline help overlay shown on the empty canvas. Bottom-centered, no
 * pointer events so it doesn't shadow the canvas under it.
 */
function FreeRoamCanvasTip({
  hasParts,
  hasPlacements,
}: {
  hasParts: boolean
  hasPlacements: boolean
}) {
  if (!hasParts) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <div className="rounded-md border border-border/60 bg-background/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          Add parts from the queue to start.
        </div>
      </div>
    )
  }
  if (!hasPlacements) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <div className="rounded-md border border-border/60 bg-background/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          Click a part to place · drag to move · click to select · R to rotate · Delete to remove
        </div>
      </div>
    )
  }
  return null
}

interface FreeRoamContentProps {
  parts: PartTemplate[]
  /** Fires when the operator adds a new shape from the registry. */
  onPartsChange: (parts: PartTemplate[]) => void
  stock: StockConfig
  onStockChange: (stock: StockConfig) => void
  refreshKey: number
  /**
   * Optional hook fired after a saved cut is loaded — lets the parent
   * react (e.g. surface a toast or analytics ping). The actual state
   * restoration (placements, parts queue, stock) happens inside this
   * component since it owns those setters.
   */
  onAfterLoadCut?: (cut: CutHistory) => void
  /**
   * Fires after a manual cut is recorded so the parent can bump any
   * `refreshKey` / re-fetch side effects (the Saved-layouts dropdown
   * uses this to refresh).
   */
  onCutRecorded?: () => void
}

/**
 * Free-roam tab content — CAD-style manual placement workspace. Three
 * columns: parts queue on the left, Konva canvas in the center, Saved
 * layouts rail on the right. State (placements, selection, keyboard
 * shortcuts) is owned by `useFreeRoamPlacements`; the derived layout
 * + metrics flow out as pure `useMemo`s. Stock mutations are pushed
 * back to the parent (the page owns canonical state).
 */
export default function FreeRoamContent({
  parts,
  onPartsChange,
  stock,
  onStockChange,
  refreshKey,
  onAfterLoadCut,
  onCutRecorded,
}: FreeRoamContentProps) {
  const [partsFilter, setPartsFilter] = useState<PartsFilter>("all")
  const [addShapeOpen, setAddShapeOpen] = useState(false)
  const handleAddShape = useCallback(
    (template: PartTemplate) => {
      onPartsChange([...parts, template])
      toast.success(`${template.label} added to queue`)
    },
    [parts, onPartsChange]
  )

  // Canvas toolbar state — lifted here so `KonvaSheetRenderer` and
  // the toolbar share one source of truth. Reset returns zoom to
  // fit-to-container and restores the grid.
  const [zoomPct, setZoomPct] = useState(100)
  const [showGrid, setShowGrid] = useState(true)
  const handleResetView = useCallback(() => void (setZoomPct(100), setShowGrid(true)), [])
  const handleAddSheet = useCallback(() => {
    toast.message("Multi-sheet layouts", {
      description: "Coming in a later commit — the current sheet is the only one for now.",
    })
  }, [])

  // Flip the sheet in place — swaps W ↔ L. Placements keep their
  // absolute coordinates; a part that ends up outside the new bounds
  // is the operator's to drag back. Fires from the hook's R-key
  // handler when nothing is selected.
  const handleRotateSheet = useCallback(() => {
    onStockChange({ ...stock, width: stock.length, length: stock.width })
  }, [stock, onStockChange])

  const {
    placements,
    setPlacements,
    placedCounts,
    selectedPartId,
    setSelectedPartId,
    handleAddInstance,
    handlePartDragEnd,
  } = useFreeRoamPlacements(parts, stock, { onRotateSheet: handleRotateSheet })

  const handleLoadCut = useLoadManualCut({
    onPartsChange,
    onStockChange,
    setPlacements,
    onAfterLoadCut,
  })

  // Drop focus from any rail text input when the canvas is touched —
  // otherwise the placements hook's keydown sees INPUT and skips R /
  // Delete shortcuts.
  const blurIfEditable = () => {
    const active = document.activeElement as HTMLElement | null
    if (
      active &&
      (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)
    ) {
      active.blur()
    }
  }
  const handlePartClick = useCallback(
    (partId: string) => {
      blurIfEditable()
      setSelectedPartId(partId)
    },
    [setSelectedPartId]
  )
  const handleSheetClick = useCallback(() => {
    blurIfEditable()
    setSelectedPartId(null)
  }, [setSelectedPartId])

  // Tag map — A / B / C / … per template so the canvas labels match
  // the parts queue. Uses partNumber when set, else generated letters.
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

  // Konva moves the dragged Group; React only needs the live position
  // for reactive downstream (waste regions). `useDragSnapshot`
  // rAF-throttles to keep Clipper diffs off every pointer-move.
  const {
    snapshot: dragSnapshot,
    onDragMove: handlePartDragMove,
    onDragEnd: clearDragSnapshot,
  } = useDragSnapshot()

  const handlePartDragEndWrapped = useCallback(
    (partId: string, xIn: number, yIn: number) => {
      clearDragSnapshot()
      handlePartDragEnd(partId, xIn, yIn)
    },
    [clearDragSnapshot, handlePartDragEnd]
  )

  // Effective placements = committed placements with the live drag
  // snapshot substituted in for the actively-dragged part.
  const effectivePlacements = useMemo(() => {
    if (!dragSnapshot) return placements
    return placements.map((p) =>
      p.id === dragSnapshot.partId ? { ...p, x: dragSnapshot.x, y: dragSnapshot.y } : p
    )
  }, [placements, dragSnapshot])

  // Region computation. See `use-free-roam-regions.ts` for the
  // committed-vs-live split + cache invalidation rules (issue #117).
  const { regions, committedRegions } = useFreeRoamRegions(
    placements,
    effectivePlacements,
    parts,
    stock,
    dragSnapshot != null
  )

  // Dev-only handler for the "Dump region timings" overlay button.
  // Body lives in `dumpRegionTimingsToConsole` (module-level) so it's
  // DCE-friendly and doesn't bloat the component.
  const handleDumpRegionTimings = useCallback(() => dumpRegionTimingsToConsole(), [])

  const layout = useFreeRoamLayout(
    effectivePlacements,
    parts,
    stock,
    tagByTemplateId,
    regions.offcuts,
    regions.scrap
  )

  const derivedMetrics = useMemo<SimpleCutMetrics | null>(
    () => deriveManualMetrics(placements, parts, stock, committedRegions),
    [placements, parts, stock, committedRegions]
  )

  const { isRecordingCut, recordCut } = useRecordManualCut(
    stock,
    derivedMetrics,
    placements,
    parts,
    onCutRecorded
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
            onAddShape={() => setAddShapeOpen(true)}
          />
        </WorkspaceColumn>

        <WorkspaceColumn column="center">
          <div className="flex h-full flex-col">
            <CanvasToolbar
              zoom={zoomPct}
              onZoomChange={setZoomPct}
              showGrid={showGrid}
              onShowGridChange={setShowGrid}
              onResetView={handleResetView}
              onAddSheet={handleAddSheet}
            />
            <div className="relative flex-1 bg-muted/10 overflow-hidden">
              <KonvaSheetRenderer
                layout={layout}
                onPartDragEnd={handlePartDragEndWrapped}
                onPartDragMove={handlePartDragMove}
                selectedPartId={selectedPartId}
                onPartClick={handlePartClick}
                onSheetClick={handleSheetClick}
                sheetBase="offcut"
                zoomPct={zoomPct}
                showGrid={showGrid}
              />
              <FreeRoamCanvasTip
                hasParts={parts.length > 0}
                hasPlacements={placements.length > 0}
              />
              {process.env.NODE_ENV !== "production" && (
                <DumpRegionTimingsButton onClick={handleDumpRegionTimings} />
              )}
            </div>
          </div>
        </WorkspaceColumn>

        <WorkspaceColumn column="right" scroll="y">
          <FreeRoamSavedLayoutsRail
            stock={stock}
            onStockChange={onStockChange}
            cutMetrics={derivedMetrics}
            onRecordCut={recordCut}
            isRecordingCut={isRecordingCut}
            refreshKey={refreshKey}
            onLoadCut={handleLoadCut}
          />
        </WorkspaceColumn>
      </WorkspaceRow>

      <FreeRoamAddShapeDialog
        open={addShapeOpen}
        onOpenChange={setAddShapeOpen}
        onAdd={handleAddShape}
      />

      {/* Deep-link loader — when the operator reopens a manual cut
          from /dashboard/history, the history page routes them here
          with `?loadCut=<id>`. This loader fetches the row and
          hands it to the same load handler the Saved-layouts
          dropdown uses, then strips the query param. */}
      <CutLoader onLoad={handleLoadCut} returnPath="/dashboard/cutting-engine/free-roam" />
    </div>
  )
}
