// Simple mode render for NestingVisualizer.
// Phase 5 PR 4 — SheetSvg + SheetDebugOverlays moved to sheet-svg.tsx;
// this file now owns the wrapper layout (header / metrics / cut plan)
// and the new selection / live-region / drawer wiring.

import React from "react"
import type { DebugOverlayOptions, PreviewItem, MultiSheetResult } from "./nesting-visualizer-types"
import type { NestingResult } from "@/nesting/types"
import {
  SimpleModeHeader,
  SimpleModeMetrics,
  SimpleModeFooter,
  SimpleModeCutPlan,
} from "./nesting-viz-simple-parts"
import { SimpleModeAdhesives } from "./nesting-viz-adhesives"
import { computeSimpleModeLayout } from "./nesting-viz-simple-layout"
import { computeFabricationScore } from "./nesting-preview-builders"
import { formatInches } from "./nesting-layout-utils"
import type { SimplePartPreview } from "./nesting-visualizer-types"
import type { LayoutModel, PlacedPart } from "./layout-model"
import { CutLegend } from "./cut-legend"
import SheetSvg from "./sheet-svg"
import SheetSelectionDrawer from "./sheet-selection-drawer"
import { useSheetSelection } from "./use-sheet-selection"

interface SimpleModeProps {
  preview: SimplePartPreview
  previewRollW: number
  previewRollL: number
  patternSeed: string
  viewMode: "stock" | "profile"
  optimizedResult: NestingResult | null
  optimizedItems: PreviewItem[] | null
  isOptimizing: boolean
  nfpError: string | null
  multiSheet?: MultiSheetResult | null
  /**
   * Source-of-truth `LayoutModel[]` from the Rust pack pipeline. Drives
   * the `CutLegend` (tag → dimension-label table) so the descriptor is
   * the part's actual dimensions rather than a tag-as-self lookup.
   */
  layouts?: LayoutModel[]
  /**
   * Dev-only diagnostic overlays. Both default off and the renderer
   * gates the actual paint on `IS_DEV` so production bundles ship no
   * overlay code.
   */
  debugOverlays?: DebugOverlayOptions
  /** Duration of the current (or most recent) Rust pack call, in ms. */
  packDurationMs?: number
  /** True while a Rust pack call is in flight — drives the spinner on the pill. */
  isPackLive?: boolean
  /** False before any pack has run — hides the pill on a fresh session. */
  hasPackMeasurement?: boolean
}

// Area in square inches. Falls back to bbox when the Rust adapter
// did not materialize a placed polygon (plain rects). Matches the
// approach `itemAabb` uses in sheet-svg.tsx.
function partAreaSqIn(part: PlacedPart): number {
  if (part.polygon && part.polygon.length >= 3) {
    let sum = 0
    const n = part.polygon.length
    for (let i = 0; i < n; i += 1) {
      const a = part.polygon[i]
      const b = part.polygon[(i + 1) % n]
      sum += a.x * b.y - b.x * a.y
    }
    return Math.abs(sum) / 2
  }
  return Math.max(0, part.width * part.height)
}

// Look up the layoutModel + part-within-sheet for a selected part id.
// O(layouts.length × parts/layout) which is bounded — typically
// 1–4 sheets × < 200 parts.
interface SelectedPartLocation {
  layoutModel: LayoutModel
  part: PlacedPart
  partIndex: number
}

function findSelectedPart(
  layouts: LayoutModel[] | undefined,
  selectedId: string | null
): SelectedPartLocation | null {
  if (!layouts || !selectedId) return null
  for (const layoutModel of layouts) {
    const partIndex = layoutModel.parts.findIndex((p) => p.id === selectedId)
    if (partIndex !== -1) {
      return { layoutModel, part: layoutModel.parts[partIndex], partIndex }
    }
  }
  return null
}

function buildLiveRegionCopy(loc: SelectedPartLocation | null, sheetAreaSharePct: number): string {
  if (!loc) return ""
  const { part, partIndex, layoutModel } = loc
  return (
    `Selected part ${part.label}, ` +
    `${formatInches(part.width)} by ${formatInches(part.height)} inches, ` +
    `placement ${partIndex + 1} of ${layoutModel.parts.length}, ` +
    `${sheetAreaSharePct.toFixed(1)} percent of sheet area`
  )
}

export default function NestingVizSimpleMode({
  preview,
  previewRollW,
  previewRollL,
  patternSeed,
  viewMode,
  optimizedResult,
  optimizedItems,
  isOptimizing,
  nfpError,
  multiSheet,
  layouts,
  debugOverlays,
  packDurationMs,
  isPackLive,
  hasPackMeasurement,
}: SimpleModeProps) {
  const layout = React.useMemo(
    () =>
      computeSimpleModeLayout({
        preview,
        previewRollW,
        previewRollL,
        patternSeed,
        viewMode,
        optimizedResult,
        optimizedItems,
      }),
    [preview, previewRollW, previewRollL, patternSeed, viewMode, optimizedResult, optimizedItems]
  )

  const isMultiSheet = (multiSheet?.sheets.length ?? 0) > 1
  // When multiSheet exists with 1 sheet, use its gap-filled preview for metrics
  // instead of the base layout.displayPreview (which lacks gap-filled items).
  const metricsPreview =
    multiSheet && multiSheet.sheets.length === 1
      ? multiSheet.sheets[0].preview
      : layout.displayPreview
  const metricsUsedSqFt = metricsPreview.usedArea / 144
  const metricsReusableSqFt = metricsPreview.reusableArea / 144
  const metricsScrapSqFt = metricsPreview.scrapArea / 144
  const metricsFabScore =
    metricsPreview !== layout.displayPreview
      ? computeFabricationScore(metricsPreview, previewRollW, previewRollL)
      : layout.fabScore
  const sheets = multiSheet?.sheets ?? [
    { sheetIndex: 0, preview: layout.displayPreview, isPartial: false },
  ]

  const { selectedId, selectPart } = useSheetSelection(layouts)

  const selectedLocation = React.useMemo(
    () => findSelectedPart(layouts, selectedId),
    [layouts, selectedId]
  )

  const sheetAreaSharePct = React.useMemo(() => {
    if (!selectedLocation) return 0
    const sheetArea =
      selectedLocation.layoutModel.sheetWidth * selectedLocation.layoutModel.sheetLength
    if (sheetArea <= 0) return 0
    return (partAreaSqIn(selectedLocation.part) / sheetArea) * 100
  }, [selectedLocation])

  const liveCopy = React.useMemo(
    () => buildLiveRegionCopy(selectedLocation, sheetAreaSharePct),
    [selectedLocation, sheetAreaSharePct]
  )

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <SimpleModeHeader
        previewTitle={layout.previewTitle}
        layoutNote={layout.layoutNote}
        displayPreview={metricsPreview}
        pieceCountLabel={layout.pieceCountLabel}
        pieceCountValue={`${metricsPreview.piecesShown}`}
        reusableOffcutSqFt={metricsReusableSqFt}
        reusableOffcutPct={
          layout.stockSqFt > 0 ? (metricsReusableSqFt / layout.stockSqFt) * 100 : 0
        }
        reusableMetricLabel={layout.reusableMetricLabel}
        scrapMetricLabel={layout.scrapMetricLabel}
        scrapPct={layout.stockSqFt > 0 ? (metricsScrapSqFt / layout.stockSqFt) * 100 : 0}
        isSplitStockPreview={layout.isSplitStockPreview}
        missingCutPieceCount={Math.max(
          0,
          metricsPreview.requestedUnits - metricsPreview.piecesShown
        )}
        isOptimizedResult={layout.isOptimizedResult}
        isOptimizing={isOptimizing}
        nfpError={nfpError}
        multiSheet={multiSheet}
        packDurationMs={packDurationMs}
        isPackLive={isPackLive}
        hasPackMeasurement={hasPackMeasurement}
      />

      {layouts && layouts.length > 0 && <CutLegend layouts={layouts} />}

      <div
        className={`bg-card px-2 py-4 sm:px-4 ${isMultiSheet ? "flex flex-col gap-6 md:grid-cols-2" : "overflow-x-auto"}`}
      >
        {sheets.map((sheet) => (
          <SheetSvg
            key={`sheet-${sheet.sheetIndex}`}
            sheet={sheet}
            layout={layout}
            previewRollW={previewRollW}
            previewRollL={previewRollL}
            isMultiSheet={isMultiSheet}
            totalSheets={sheets.length}
            layoutModel={layouts?.[sheet.sheetIndex]}
            debugOverlays={debugOverlays}
            selectedPartId={selectedId}
            onSelectPart={selectPart}
          />
        ))}
      </div>

      <SimpleModeMetrics
        displayPreview={metricsPreview}
        usedSqFt={metricsUsedSqFt}
        reusableOffcutSqFt={metricsReusableSqFt}
        scrapSqFt={metricsScrapSqFt}
        reusableMetricLabel={layout.reusableMetricLabel}
        pieceCountLabel={layout.pieceCountLabel}
        pieceCountValue={`${metricsPreview.piecesShown}`}
        fabScore={metricsFabScore}
        multiSheet={multiSheet}
      />

      <SimpleModeAdhesives
        usedSqFt={isMultiSheet && multiSheet ? multiSheet.totalUsedArea / 144 : metricsUsedSqFt}
      />

      <SimpleModeFooter
        metricsAreEstimatedFromStock={layout.metricsAreEstimatedFromStock}
        stockSqFt={layout.stockSqFt}
        displayPreview={metricsPreview}
        isSplitStockPreview={layout.isSplitStockPreview}
        missingCutPieceCount={Math.max(
          0,
          metricsPreview.requestedUnits - metricsPreview.piecesShown
        )}
        multiSheet={multiSheet}
      />

      {layout.showCutPlan && <SimpleModeCutPlan displayPreview={layout.displayPreview} />}

      {/* Visually-hidden live region — announces the most recent
          selection. NVDA / VoiceOver read this when `liveCopy`
          changes; sighted users never see it. */}
      <span
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-testid="sheet-selection-live-region"
      >
        {liveCopy}
      </span>

      <SheetSelectionDrawer
        part={selectedLocation?.part ?? null}
        placementIndex={(selectedLocation?.partIndex ?? 0) + 1}
        totalPlacements={selectedLocation?.layoutModel.parts.length ?? 0}
        sheetAreaSharePct={sheetAreaSharePct}
        onClose={() => selectPart(null)}
      />
    </div>
  )
}
