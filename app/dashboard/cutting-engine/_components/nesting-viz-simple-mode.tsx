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
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import {
  formatDimensionsInchesForSpeech,
  type UnitDisplayPreferencesInput,
} from "@/src/application/preferences/user-unit-display"
import type { SimplePartPreview } from "./nesting-visualizer-types"
import type { LayoutModel, PlacedPart } from "./layout-model"
import { CutLegend } from "./cut-legend"
import SheetSvg from "./sheet-svg"
import SheetThumbnail from "./sheet-thumbnail"
import SheetSelectionDrawer from "./sheet-selection-drawer"
import NestingPackStatePanel from "./nesting-pack-state-panel"
import { useSheetSelection } from "./use-sheet-selection"
import { buildSheetSummary } from "./sheet-summary"

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
  /**
   * Phase 5 PR 7 — what the visualizer should render instead of the
   * actual layout. `"ready"` means render the SheetSvg detail (current
   * behavior); `"empty"`, `"loading"`, and `"error"` swap in the state
   * panel. The parent (NestingVisualizer) derives this from the
   * combination of packGateStatus, isPacking, packError, and whether
   * any layouts are available.
   */
  packState?: "empty" | "loading" | "error" | "ready"
  packError?: string
  onRetryPack?: () => void
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
  /** Index into the parent `layouts` array — used by PR 6 to drive the "On Sheet N" drawer UI and the "Jump to Sheet N" action. */
  sheetIndex: number
}

function findSelectedPart(
  layouts: LayoutModel[] | undefined,
  selectedId: string | null
): SelectedPartLocation | null {
  if (!layouts || !selectedId) return null
  for (let sheetIndex = 0; sheetIndex < layouts.length; sheetIndex += 1) {
    const layoutModel = layouts[sheetIndex]
    const partIndex = layoutModel.parts.findIndex((p) => p.id === selectedId)
    if (partIndex !== -1) {
      return { layoutModel, part: layoutModel.parts[partIndex], partIndex, sheetIndex }
    }
  }
  return null
}

function buildLiveRegionCopy(
  loc: SelectedPartLocation | null,
  sheetAreaSharePct: number,
  unitPreferences?: UnitDisplayPreferencesInput
): string {
  if (!loc) return ""
  const { part, partIndex, layoutModel } = loc
  const dims = formatDimensionsInchesForSpeech([part.width, part.height], unitPreferences)
  return (
    `Selected part ${part.label}, ` +
    `${dims}, ` +
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
  packState = "ready",
  packError,
  onRetryPack,
}: SimpleModeProps) {
  const organizationPreferences = useOrganizationPreferences()
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
    () => buildLiveRegionCopy(selectedLocation, sheetAreaSharePct, organizationPreferences),
    [selectedLocation, sheetAreaSharePct, organizationPreferences]
  )

  // PR 6 — active sheet for the thumbnail strip + per-sheet detail.
  // Stored in parent state (Codex's recommendation; URL-mirroring is a
  // future enhancement). Clamped whenever the sheets array shrinks
  // after a re-pack — without the clamp, a stale index could point
  // past the new array length and crash the detail render.
  const [activeSheetIndex, setActiveSheetIndex] = React.useState(0)
  React.useEffect(() => {
    if (activeSheetIndex >= sheets.length) {
      setActiveSheetIndex(Math.max(0, sheets.length - 1))
    }
  }, [activeSheetIndex, sheets.length])

  // Keyboard rover inside the thumbnail strip. Independent of active
  // state: arrow keys move focus between thumbnails; Enter/Space
  // activates. Initialises to the active thumbnail so Tab into the
  // strip lands on the current sheet.
  const [focusedThumbIndex, setFocusedThumbIndex] = React.useState(0)
  React.useEffect(() => {
    setFocusedThumbIndex(activeSheetIndex)
  }, [activeSheetIndex])

  const thumbButtonRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const focusThumbAt = React.useCallback((idx: number) => {
    setFocusedThumbIndex(idx)
    thumbButtonRefs.current[idx]?.focus()
  }, [])
  const onStripKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        focusThumbAt(Math.min(sheets.length - 1, focusedThumbIndex + 1))
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        focusThumbAt(Math.max(0, focusedThumbIndex - 1))
      } else if (e.key === "Home") {
        e.preventDefault()
        focusThumbAt(0)
      } else if (e.key === "End") {
        e.preventDefault()
        focusThumbAt(sheets.length - 1)
      }
    },
    [focusThumbAt, focusedThumbIndex, sheets.length]
  )

  // Derive a clamped active index for THIS render pass. The
  // `useEffect` above persists the corrected value back into state for
  // future renders, but using the raw `activeSheetIndex` directly would
  // briefly mark the wrong thumbnail as active / drive the wrong detail
  // pass after a re-pack shrinks the sheet list.
  const safeActiveSheetIndex = Math.min(Math.max(0, activeSheetIndex), sheets.length - 1)
  const activeSheet = sheets[safeActiveSheetIndex] ?? sheets[0]
  // Per-sheet stock area — the multi-sheet total would make every
  // "Sheet N: X percent scrap" line read as "X percent of all stock,"
  // which is meaningless when operators inspect one sheet at a time.
  const activeSheetStockArea =
    activeSheet.preview.usedArea + activeSheet.preview.scrapArea + activeSheet.preview.reusableArea
  const activeSheetSummary = React.useMemo(
    () =>
      buildSheetSummary(
        activeSheet,
        sheets.length,
        activeSheetStockArea > 0 ? activeSheetStockArea : layout.stockSqFt * 144
      ),
    [activeSheet, sheets.length, activeSheetStockArea, layout.stockSqFt]
  )

  // PR 6 follow-up — after a "Jump to Sheet N" click in the drawer, the
  // off-sheet block (which contained the click target) unmounts. Move
  // focus to the newly-active thumbnail so keyboard / screen-reader
  // users land somewhere meaningful instead of falling back to `body`.
  const handleJumpToSheet = React.useCallback((idx: number) => {
    setActiveSheetIndex(idx)
    requestAnimationFrame(() => {
      thumbButtonRefs.current[idx]?.focus()
    })
  }, [])

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

      {/* PR 7 — thumbnails are hidden during loading/error and empty
          states so a partial / nonexistent sheet count can't drive a
          ghost strip. Only shown when we have real multi-sheet data. */}
      {isMultiSheet && packState === "ready" && (
        <div
          // Phase 5 PR 6 — thumbnail strip. Plain toolbar / button-strip
          // (NOT a `tablist`): the buttons use `aria-pressed` rather
          // than `role="tab"` + `aria-selected`, and the detail SVG is
          // not a tabpanel in the strict sense. `role="toolbar"` is the
          // honest mapping for "row of related buttons with a single
          // Tab stop and arrow-key roving."
          role="toolbar"
          aria-label="Stock sheets"
          aria-orientation="horizontal"
          onKeyDown={onStripKeyDown}
          className="flex h-24 items-center gap-3 overflow-x-auto border-b border-border bg-muted/20 px-3 py-2"
        >
          {sheets.map((sheet, idx) => (
            <SheetThumbnail
              key={`thumb-${sheet.sheetIndex}`}
              ref={(node) => {
                thumbButtonRefs.current[idx] = node
              }}
              sheet={sheet}
              layoutModel={layouts?.[sheet.sheetIndex]}
              totalSheets={sheets.length}
              isActive={idx === safeActiveSheetIndex}
              onActivate={() => setActiveSheetIndex(idx)}
              tabIndex={idx === focusedThumbIndex ? 0 : -1}
              layout={layout}
            />
          ))}
        </div>
      )}

      <div className="bg-card px-2 py-4 sm:px-4">
        {packState === "ready" ? (
          <SheetSvg
            // `key` forces React to unmount the previous SheetSvg and
            // mount a fresh one on active-sheet switch, so internal
            // state (zoom, pan, drag refs, keyboard focus) resets
            // cleanly. Per Codex's recommendation: stale focusedIndex
            // from a no-longer-visible sheet would paint a phantom
            // keyboard ring if SheetSvg were reused.
            key={`detail-${activeSheet.sheetIndex}`}
            sheet={activeSheet}
            layout={layout}
            previewRollW={previewRollW}
            previewRollL={previewRollL}
            isMultiSheet={isMultiSheet}
            totalSheets={sheets.length}
            layoutModel={layouts?.[activeSheet.sheetIndex]}
            debugOverlays={debugOverlays}
            selectedPartId={selectedId}
            onSelectPart={selectPart}
            ariaSummary={activeSheetSummary}
          />
        ) : (
          <NestingPackStatePanel
            kind={packState}
            rollWidth={previewRollW}
            rollLength={previewRollL}
            errorMessage={packError}
            onRetry={onRetryPack}
            isPacking={isOptimizing}
          />
        )}
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
        partSheetIndex={selectedLocation?.sheetIndex}
        activeSheetIndex={isMultiSheet ? safeActiveSheetIndex : undefined}
        totalSheets={isMultiSheet ? sheets.length : undefined}
        onJumpToSheet={isMultiSheet ? handleJumpToSheet : undefined}
      />
    </div>
  )
}
