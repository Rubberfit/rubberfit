"use client"

import { useCallback, useMemo, useState } from "react"
import { ChevronUp, Plus, Upload } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/app/components/ui/sheet"
import { gasketSpecToPartTemplate } from "@/src/application/gasket/gasket-template"
import type { GasketSpec } from "@/src/application/gasket/gasket-template"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

import { AddGasketSheet } from "./add-gasket-sheet"
import { CanvasToolbar } from "./canvas-toolbar"
import DxfReviewDialog from "./dxf-review-dialog"
import { GasketShapeCard } from "./gasket-shape-card"
import KonvaSheetRenderer from "./KonvaSheetRenderer"
import { deriveManualMetrics } from "./manual-layout/metrics"
import { useManualLayout } from "./manual-layout/use-manual-layout"
import { useManualPlacements } from "./manual-layout/use-manual-placements"
import { useManualRegions } from "./manual-layout/use-manual-regions"
import type { PartTemplate } from "./preset-template-data"
import type { StockConfig } from "./stock-preview-configurator"
import SvgReviewDialog from "./svg-review-dialog"
import { FreeRoamStockEditor } from "./free-roam-stock-editor"
import { useCadImport } from "./use-cad-import"
import { useDragSnapshot } from "./use-drag-snapshot"
import { useLoadManualCut } from "./use-load-manual-cut"
import { useRecordManualCut } from "./use-record-manual-cut"

interface GasketCuttingContentProps {
  parts: PartTemplate[]
  onPartsChange: (parts: PartTemplate[]) => void
  stock: StockConfig
  onStockChange: (stock: StockConfig) => void
  refreshKey: number
  onCutRecorded: () => void
  onAfterLoadCut?: (cut: CutHistory) => void
}

export default function GasketCuttingContent({
  parts,
  onPartsChange,
  stock,
  onStockChange,
  onCutRecorded,
  onAfterLoadCut,
}: GasketCuttingContentProps) {
  const [isAddGasketOpen, setIsAddGasketOpen] = useState(false)
  const [isMobileQueueOpen, setIsMobileQueueOpen] = useState(false)
  const [zoomPct, setZoomPct] = useState(100)
  const [showGrid, setShowGrid] = useState(true)

  // Stock-rotate handler — declared BEFORE the placements hook reads
  // it via options. Swaps W ↔ L; placements keep their coordinates.
  const handleRotateSheet = useCallback(() => {
    onStockChange({ ...stock, width: stock.length, length: stock.width })
  }, [stock, onStockChange])

  const handleResetView = useCallback(() => {
    setZoomPct(100)
    setShowGrid(true)
  }, [])

  const {
    placements,
    setPlacements,
    placedCounts,
    selectedPartId,
    setSelectedPartId,
    handleAddInstance,
    handlePartDragEnd,
  } = useManualPlacements(parts, stock, { onRotateSheet: handleRotateSheet })

  const {
    snapshot: dragSnapshot,
    onDragMove: handlePartDragMove,
    onDragEnd: clearDragSnapshot,
  } = useDragSnapshot()

  // Same drag-snapshot composition as free-roam-content — overlay the
  // live drag position over the committed placements so regions /
  // metrics update on every rAF tick.
  const effectivePlacements = useMemo(() => {
    if (!dragSnapshot) return placements
    return placements.map((p) =>
      p.id === dragSnapshot.partId ? { ...p, x: dragSnapshot.x, y: dragSnapshot.y } : p
    )
  }, [placements, dragSnapshot])

  const { regions, committedRegions } = useManualRegions(
    placements,
    effectivePlacements,
    parts,
    stock,
    dragSnapshot != null
  )

  // Tag map — A / B / C / … per template (mirrors free-roam-content's
  // partNumber-overrides-letter rule).
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

  const layout = useManualLayout(
    effectivePlacements,
    parts,
    stock,
    tagByTemplateId,
    regions.offcuts,
    regions.scrap
  )

  const derivedMetrics = useMemo(
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

  const handleLoadCut = useLoadManualCut({
    onPartsChange,
    onStockChange,
    setPlacements,
    onAfterLoadCut,
  })
  // Tap the loader so unused-import lint doesn't complain when the
  // deep-link CutLoader is wired in a follow-up commit (mirrors free-
  // roam-content's pattern). For now: silent reference.
  void handleLoadCut

  const handlePartDragEndWrapped = useCallback(
    (partId: string, xIn: number, yIn: number) => {
      clearDragSnapshot()
      handlePartDragEnd(partId, xIn, yIn)
    },
    [clearDragSnapshot, handlePartDragEnd]
  )

  const handlePartClick = useCallback(
    (partId: string) => setSelectedPartId(partId),
    [setSelectedPartId]
  )
  const handleSheetClick = useCallback(
    () => setSelectedPartId(null),
    [setSelectedPartId]
  )

  const handleAddGasket = useCallback(
    (spec: GasketSpec, quantity: number, partNumber?: string) => {
      const base = gasketSpecToPartTemplate(spec)
      const newTemplate: PartTemplate = {
        ...base,
        id: crypto.randomUUID(),
        quantity,
        partNumber: partNumber || undefined,
      }
      onPartsChange([...parts, newTemplate])
    },
    [parts, onPartsChange]
  )

  const handleRemoveTemplate = useCallback(
    (id: string) => {
      onPartsChange(parts.filter((p) => p.id !== id))
    },
    [parts, onPartsChange]
  )

  const handleCardClick = useCallback(
    (template: PartTemplate) => handleAddInstance(template),
    [handleAddInstance]
  )

  const handleSaveCut = useCallback(async () => {
    await recordCut()
  }, [recordCut])

  const cadImport = useCadImport({
    onAdd: (template) => onPartsChange([...parts, template]),
  })

  // Founder ruling 2026-05-15: Import CAD launches the existing
  // review dialog as a SEPARATE modal. Close the Add gasket Sheet
  // first so file picker → review dialog doesn't open behind it.
  const handleImportDxf = useCallback(() => {
    setIsAddGasketOpen(false)
    void cadImport.pickDxf()
  }, [cadImport])
  const handleImportSvg = useCallback(() => {
    setIsAddGasketOpen(false)
    void cadImport.pickSvg()
  }, [cadImport])

  const totalQueueCount = parts.reduce((sum, p) => sum + p.quantity, 0)
  const stockSheetSqFt = (stock.width * stock.length) / 144

  return (
    <div className="flex h-full flex-col gap-4 md:flex-row">
      {/* Desktop left rail */}
      <div className="hidden flex-col gap-3 md:flex md:w-72 md:shrink-0">
        <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Gasket queue
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {parts.map((template) => (
            <GasketShapeCard
              key={template.id}
              template={template}
              tagLetter={tagByTemplateId.get(template.id) ?? "A"}
              placedCount={placedCounts[template.id] ?? 0}
              onClick={() => handleCardClick(template)}
              onRemove={() => handleRemoveTemplate(template.id)}
            />
          ))}
          {parts.length === 0 && (
            <div className="text-muted-foreground py-8 text-center text-sm">
              No gaskets in queue
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => setIsAddGasketOpen(true)}
            className="bg-orange-500 text-white hover:bg-orange-600"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add gasket
          </Button>
          <Button variant="outline" onClick={() => setIsAddGasketOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import CAD
          </Button>
        </div>
      </div>

      {/* Center canvas */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute top-3 left-3 z-10">
          <CanvasToolbar
            zoom={zoomPct}
            onZoomChange={setZoomPct}
            showGrid={showGrid}
            onShowGridChange={setShowGrid}
            onResetView={handleResetView}
          />
        </div>
        <div className="bg-muted/30 h-full w-full overflow-hidden rounded-lg border">
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
        </div>
      </div>

      {/* Desktop right rail */}
      <div className="hidden flex-col gap-3 md:flex md:w-72 md:shrink-0">
        <FreeRoamStockEditor stock={stock} onChange={onStockChange} />
        <div className="space-y-3 rounded-lg border p-4">
          <div className="text-sm font-medium">Cut metrics</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">Yield</div>
            <div className="text-right font-medium">
              {derivedMetrics && stockSheetSqFt > 0
                ? `${((derivedMetrics.materialUsedSqFt / stockSheetSqFt) * 100).toFixed(1)}%`
                : "—"}
            </div>
            <div className="text-muted-foreground">Linear feet</div>
            <div className="text-right font-medium">
              {(stock.length / 12).toFixed(1)}
            </div>
            <div className="text-muted-foreground">Part count</div>
            <div className="text-right font-medium">
              {derivedMetrics?.partsCompleted ?? 0}
            </div>
          </div>
        </div>
        <Button
          onClick={handleSaveCut}
          disabled={isRecordingCut || placements.length === 0}
          className="bg-orange-500 text-white hover:bg-orange-600"
        >
          {isRecordingCut ? "Saving..." : "Save cut"}
        </Button>
      </div>

      {/* Mobile queue toggle */}
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 md:hidden">
        <Sheet open={isMobileQueueOpen} onOpenChange={setIsMobileQueueOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="shadow-lg">
              <ChevronUp className="mr-2 h-4 w-4" />
              Gasket queue ({totalQueueCount})
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[60vh]">
            <SheetHeader>
              <SheetTitle>Gasket queue</SheetTitle>
            </SheetHeader>
            <div className="mt-4 h-[calc(60vh-5rem)] space-y-2 overflow-y-auto">
              {parts.map((template) => (
                <GasketShapeCard
                  key={template.id}
                  template={template}
                  tagLetter={tagByTemplateId.get(template.id) ?? "A"}
                  placedCount={placedCounts[template.id] ?? 0}
                  onClick={() => {
                    handleCardClick(template)
                    setIsMobileQueueOpen(false)
                  }}
                  onRemove={() => handleRemoveTemplate(template.id)}
                />
              ))}
              {parts.length === 0 && (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  No gaskets in queue
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                onClick={() => {
                  setIsAddGasketOpen(true)
                  setIsMobileQueueOpen(false)
                }}
                className="bg-orange-500 text-white hover:bg-orange-600"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add gasket
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddGasketOpen(true)
                  setIsMobileQueueOpen(false)
                }}
              >
                <Upload className="mr-2 h-4 w-4" />
                Import CAD
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Add gasket sheet */}
      <AddGasketSheet
        open={isAddGasketOpen}
        onOpenChange={setIsAddGasketOpen}
        onAdd={handleAddGasket}
        onImportDxf={handleImportDxf}
        onImportSvg={handleImportSvg}
      />

      {cadImport.dxfReview && (
        <DxfReviewDialog
          open
          parts={cadImport.dxfReview.parts}
          detectedUnits={cadImport.dxfReview.detectedUnits}
          rejected={cadImport.dxfReview.rejected}
          ignoredLayers={cadImport.dxfReview.ignoredLayers}
          sourceFile={cadImport.dxfReview.sourceFile}
          onConfirm={cadImport.confirmDxf}
          onCancel={cadImport.cancelDxf}
        />
      )}
      {cadImport.svgReview && (
        <SvgReviewDialog
          open
          parts={cadImport.svgReview.parts}
          detectedUnits={cadImport.svgReview.detectedUnits}
          rejected={cadImport.svgReview.rejected}
          sourceFile={cadImport.svgReview.sourceFile}
          onConfirm={cadImport.confirmSvg}
          onCancel={cadImport.cancelSvg}
        />
      )}
    </div>
  )
}
