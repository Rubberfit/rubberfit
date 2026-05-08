// Simple mode sub-components for NestingVizSimpleMode
// Split from nesting-viz-simple-mode.tsx to keep files under 500 lines

import React from "react"
import { Loader2 } from "lucide-react"
import type { SimplePartPreview, OffcutBand, MultiSheetResult } from "./nesting-visualizer-types"
import { formatInches } from "./nesting-layout-utils"
// SimpleModeLayout type used by the re-exported SimpleModeDimensionLabels

function computeHeaderMetrics(
  multiSheet: MultiSheetResult | null | undefined,
  reusableOffcutSqFt: number,
  reusableOffcutPct: number,
  scrapPct: number
) {
  const isMultiSheet = (multiSheet?.sheets.length ?? 0) > 1
  const showReusable = isMultiSheet ? multiSheet!.totalReusableArea > 0 : reusableOffcutSqFt > 0
  const totalStock = isMultiSheet ? multiSheet!.totalStockArea : 0
  const reusablePctDisplay = isMultiSheet
    ? totalStock > 0
      ? ((multiSheet!.totalReusableArea / totalStock) * 100).toFixed(1)
      : "0.0"
    : reusableOffcutPct.toFixed(1)
  const scrapPctDisplay = isMultiSheet
    ? totalStock > 0
      ? ((multiSheet!.totalScrapArea / totalStock) * 100).toFixed(1)
      : "0.0"
    : scrapPct.toFixed(1)
  return { isMultiSheet, showReusable, reusablePctDisplay, scrapPctDisplay }
}

function OverflowBadge({
  multiSheet,
  displayPreview,
  isSplitStockPreview,
  missingCutPieceCount,
}: {
  multiSheet?: MultiSheetResult | null
  displayPreview: SimplePartPreview
  isSplitStockPreview: boolean
  missingCutPieceCount: number
}) {
  if (multiSheet && multiSheet.remainingOverflow > 0) {
    return (
      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-medium text-amber-600">
        +{multiSheet.remainingOverflow} part{multiSheet.remainingOverflow === 1 ? "" : "s"} exceed{" "}
        {multiSheet.sheets.length}-sheet limit
      </span>
    )
  }
  if (!multiSheet && displayPreview.overflowUnits > 0) {
    const label = isSplitStockPreview
      ? `+${missingCutPieceCount} cut piece${missingCutPieceCount === 1 ? "" : "s"} need another sheet`
      : `+${displayPreview.overflowUnits} part${displayPreview.overflowUnits === 1 ? "" : "s"} need another sheet`
    return (
      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-medium text-amber-600">
        {label}
      </span>
    )
  }
  return null
}

export function SimpleModeHeader({
  previewTitle,
  layoutNote,
  displayPreview,
  pieceCountLabel,
  pieceCountValue,
  reusableOffcutSqFt,
  reusableOffcutPct,
  reusableMetricLabel,
  scrapMetricLabel,
  scrapPct,
  isSplitStockPreview,
  missingCutPieceCount,
  isOptimizedResult,
  isOptimizing,
  nfpError,
  multiSheet,
  packDurationMs,
  isPackLive,
  hasPackMeasurement,
}: {
  previewTitle: string
  layoutNote: string
  displayPreview: SimplePartPreview
  pieceCountLabel: string
  pieceCountValue: string
  reusableOffcutSqFt: number
  reusableOffcutPct: number
  reusableMetricLabel: string
  scrapMetricLabel: string
  scrapPct: number
  isSplitStockPreview: boolean
  missingCutPieceCount: number
  isOptimizedResult: boolean
  isOptimizing: boolean
  nfpError: string | null
  multiSheet?: MultiSheetResult | null
  packDurationMs?: number
  isPackLive?: boolean
  hasPackMeasurement?: boolean
}) {
  const { isMultiSheet, showReusable, reusablePctDisplay, scrapPctDisplay } = computeHeaderMetrics(
    multiSheet,
    reusableOffcutSqFt,
    reusableOffcutPct,
    scrapPct
  )

  return (
    <div className="border-b border-border bg-muted/30 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">
            {"Rubber Sheet Nesting Layout"}
          </div>
          <div className="text-xs text-muted-foreground">{previewTitle}</div>
          <div className="mt-1 text-xs text-muted-foreground">{layoutNote}</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 font-medium text-sky-300">
            Profile: {displayPreview.strategyName}
          </span>
          <span className="rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 font-medium text-green-600">
            {pieceCountLabel}: {pieceCountValue}
          </span>
          {showReusable && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-medium text-amber-600">
              {reusableMetricLabel}: {reusablePctDisplay}%
            </span>
          )}
          <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 font-medium text-red-600">
            {scrapMetricLabel}: {scrapPctDisplay}%
          </span>
          <OverflowBadge
            multiSheet={multiSheet}
            displayPreview={displayPreview}
            isSplitStockPreview={isSplitStockPreview}
            missingCutPieceCount={missingCutPieceCount}
          />
          {isMultiSheet && multiSheet!.remainingOverflow === 0 && (
            <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 font-medium text-blue-400">
              {multiSheet!.sheets.length} sheets
            </span>
          )}
          {isOptimizedResult && (
            <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 font-medium text-violet-300">
              NFP Optimized
            </span>
          )}
          {isOptimizing && !isOptimizedResult && (
            <span className="rounded-full border border-stone-500/40 bg-stone-500/10 px-3 py-1 font-medium text-stone-400 animate-pulse">
              Optimizing...
            </span>
          )}
          {hasPackMeasurement && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 font-medium text-indigo-600 dark:text-indigo-300">
              {isPackLive && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
              <span className="tabular-nums">
                Time to Pack: {((packDurationMs ?? 0) / 1000).toFixed(1)}s
              </span>
            </span>
          )}
          {nfpError && (
            <span
              className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 font-medium text-red-400"
              title={nfpError}
            >
              NFP Error
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function SimpleModePatternDefs({
  stockPatternId,
  offcutPatternId,
  wastePatternId,
  usablePatternId,
  markerId,
}: {
  stockPatternId: string
  offcutPatternId: string
  wastePatternId: string
  usablePatternId: string
  markerId: string
}) {
  return (
    <defs>
      <pattern
        id={stockPatternId}
        width="18"
        height="18"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="18" height="18" fill="#f5f5f4" />
        <line x1="0" y1="0" x2="0" y2="18" stroke="rgba(120,113,108,0.18)" strokeWidth="1.5" />
      </pattern>
      <pattern
        id={offcutPatternId}
        width="14"
        height="14"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="14" height="14" fill="#fef3c7" />
        <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(245,158,11,0.55)" strokeWidth="2" />
      </pattern>
      <pattern
        id={wastePatternId}
        width="14"
        height="14"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="14" height="14" fill="#fef2f2" />
        <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(239,68,68,0.55)" strokeWidth="2" />
      </pattern>
      <pattern
        id={usablePatternId}
        width="18"
        height="18"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(-32)"
      >
        <rect width="18" height="18" fill="#f0fdf4" />
        <line x1="0" y1="0" x2="0" y2="18" stroke="rgba(34,197,94,0.55)" strokeWidth="2" />
      </pattern>
      <marker id={markerId} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#57534e" />
      </marker>
    </defs>
  )
}

/**
 * Phase 5 PR 3 (Treatment 1 — Precision Nesting / Industrial CAD) —
 * shared defs for the cutting-engine SVG viewer. Distinct from
 * `SimpleModePatternDefs`, which stays bound to `stock-sheet.tsx`'s
 * inventory roll preview palette.
 *
 * The aesthetic treats the viewport as a top-down photograph of a
 * rubber workpiece under a single shop light. Depth comes from
 * shared gradients + a single radial vignette + CSS drop-shadow
 * (GPU-composited) on parts; we deliberately avoid per-element SVG
 * filters because they rasterize per element and choke at 100+ parts.
 *
 * - `sheetVignettePatternId`: radial dark vignette overlay on the
 *   sheet rect, multiply-blended to simulate overhead lighting fall
 *   off at the sheet's edges.
 * - `partLightId`: cool slate linear gradient consumed by every part
 *   (top-left highlight, bottom-right shade), giving each part a
 *   "proud chunk catching the same light" read without per-shape
 *   gradient stops.
 * - `toolGridPatternId`: faint 20px dot grid suggesting a tooling
 *   surface (cutting mat / CMM table), rendered on top of the sheet
 *   base.
 * - `scrapHatchPatternId`: 4px-spaced diagonal rust hatch — engineering
 *   "marked for waste" notation, not a screaming red void.
 * - `pageGridPatternId`: 40px graph grid behind the sheet, evoking
 *   the work-surface rather than a generic page background.
 * - `markerId`: dimension-arrow head reused across the canvas.
 */
export function SimpleModeCanvasDefs({
  sheetVignetteId,
  partLightId,
  toolGridPatternId,
  scrapHatchPatternId,
  pageGridPatternId,
  markerId,
}: {
  sheetVignetteId: string
  partLightId: string
  toolGridPatternId: string
  scrapHatchPatternId: string
  pageGridPatternId: string
  markerId: string
}) {
  return (
    <defs>
      <radialGradient id={sheetVignetteId} cx="50%" cy="50%" r="70%">
        <stop offset="0%" stopColor="#000000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.20" />
      </radialGradient>
      <linearGradient id={partLightId} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#94a3b8" />
        <stop offset="100%" stopColor="#64748b" />
      </linearGradient>
      <pattern id={toolGridPatternId} width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r="1" fill="rgba(0,0,0,0.08)" />
      </pattern>
      <pattern
        id={scrapHatchPatternId}
        width="4"
        height="4"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(180,83,9,0.25)" strokeWidth="1" />
      </pattern>
      <pattern id={pageGridPatternId} width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#cbd5e1" strokeWidth="0.5" opacity="0.40" />
      </pattern>
      <marker id={markerId} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#57534e" />
      </marker>
    </defs>
  )
}

export function SimpleModeMetrics({
  displayPreview,
  usedSqFt,
  reusableOffcutSqFt,
  scrapSqFt,
  reusableMetricLabel,
  pieceCountLabel,
  pieceCountValue,
  fabScore,
  multiSheet,
}: {
  displayPreview: SimplePartPreview
  usedSqFt: number
  reusableOffcutSqFt: number
  scrapSqFt: number
  reusableMetricLabel: string
  pieceCountLabel: string
  pieceCountValue: string
  fabScore: { score: number }
  multiSheet?: MultiSheetResult | null
}) {
  const isMultiSheet = (multiSheet?.sheets.length ?? 0) > 1
  const displayScore = isMultiSheet ? multiSheet!.avgFabScore : fabScore.score
  // Fab score is only meaningful when material has been fabricated.
  // An empty sheet would otherwise render "40/100" from the seam-count
  // (0 seams = perfect) and reusable-ratio (all-waste-is-reusable)
  // components, which is misleading — nothing has been scored.
  const hasFabrication = isMultiSheet
    ? (multiSheet?.totalUnitsCompleted ?? 0) > 0
    : displayPreview.piecesShown > 0

  return (
    <div className="grid gap-3 border-t border-border bg-background px-4 py-4 md:grid-cols-6">
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Parts Completed
        </div>
        <div className="mt-1 text-2xl font-semibold text-foreground">
          {isMultiSheet ? multiSheet!.totalUnitsCompleted : displayPreview.unitsCompleted}
          {isMultiSheet && (
            <span className="ml-1 text-xs text-muted-foreground">
              across {multiSheet!.sheets.length} sheets
            </span>
          )}
        </div>
      </div>
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Material Used
        </div>
        <div className="mt-1 text-2xl font-semibold text-foreground">
          {isMultiSheet ? (multiSheet!.totalUsedArea / 144).toFixed(2) : usedSqFt.toFixed(2)} sq ft
        </div>
      </div>
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {reusableMetricLabel}
        </div>
        <div className="mt-1 text-2xl font-semibold text-amber-600">
          {isMultiSheet
            ? (multiSheet!.totalReusableArea / 144).toFixed(2)
            : reusableOffcutSqFt.toFixed(2)}{" "}
          sq ft
        </div>
      </div>
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Scrap / Waste
        </div>
        <div className="mt-1 text-2xl font-semibold text-red-600">
          {isMultiSheet ? (multiSheet!.totalScrapArea / 144).toFixed(2) : scrapSqFt.toFixed(2)} sq
          ft
        </div>
      </div>
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pieceCountLabel}
        </div>
        <div className="mt-1 text-2xl font-semibold text-foreground">{pieceCountValue}</div>
      </div>
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Fab Score
        </div>
        <div
          className={`mt-1 text-2xl font-semibold ${
            !hasFabrication
              ? "text-muted-foreground"
              : displayScore >= 80
                ? "text-green-600"
                : displayScore >= 60
                  ? "text-amber-600"
                  : "text-red-600"
          }`}
        >
          {hasFabrication ? `${displayScore}/100` : "—"}
        </div>
      </div>
    </div>
  )
}

export function SimpleModeFooter({
  metricsAreEstimatedFromStock,
  stockSqFt,
  displayPreview,
  isSplitStockPreview,
  missingCutPieceCount,
  multiSheet,
}: {
  metricsAreEstimatedFromStock: boolean
  stockSqFt: number
  displayPreview: SimplePartPreview
  isSplitStockPreview: boolean
  missingCutPieceCount: number
  multiSheet?: MultiSheetResult | null
}) {
  const isMultiSheet = (multiSheet?.sheets.length ?? 0) > 1
  const displayStockSqFt = isMultiSheet
    ? (multiSheet!.totalStockArea / 144).toFixed(2)
    : stockSqFt.toFixed(2)
  const sheetSuffix = isMultiSheet ? ` (${multiSheet!.sheets.length} sheets)` : ""

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
      {metricsAreEstimatedFromStock
        ? `Optimized from placed stock area: ${displayStockSqFt} sq ft`
        : `Preview stock area: ${displayStockSqFt} sq ft`}
      {sheetSuffix}
      {multiSheet && multiSheet.remainingOverflow > 0 && (
        <span className="ml-2 font-medium text-amber-600">
          +{multiSheet.remainingOverflow} part
          {multiSheet.remainingOverflow === 1 ? "" : "s"} exceed the {multiSheet.sheets.length}
          -sheet limit.
        </span>
      )}
      {isMultiSheet && multiSheet!.remainingOverflow === 0 && (
        <span className="ml-2 font-medium text-blue-400">
          All parts fit across {multiSheet!.sheets.length} sheets.
        </span>
      )}
      {!multiSheet && displayPreview.overflowUnits > 0 && (
        <span className="ml-2 font-medium text-amber-600">
          {isSplitStockPreview
            ? `Another sheet is required to place the remaining ${missingCutPieceCount} cut piece${missingCutPieceCount === 1 ? "" : "s"}.`
            : `Another sheet is required to place the remaining ${displayPreview.overflowUnits} part${displayPreview.overflowUnits === 1 ? "" : "s"}.`}
        </span>
      )}
    </div>
  )
}

export function SimpleModeCutPlan({ displayPreview }: { displayPreview: SimplePartPreview }) {
  return (
    <div className="border-t border-border bg-background px-4 py-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-foreground">{displayPreview.cutPlanTitle}</div>
        <div className="text-xs text-muted-foreground">
          These are the practical cut steps for one finished{" "}
          {displayPreview.renderShape === "sector" ? "cone spread" : displayPreview.renderShape}.
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {displayPreview.cutSteps.map((step, index) => (
          <div key={`${step.title}-${index + 1}`} className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/15 text-[11px] font-semibold text-sky-700">
                {index + 1}
              </span>
              <div className="text-sm font-semibold text-foreground">{step.title}</div>
            </div>
            <div className="mt-2 text-xs leading-5 text-muted-foreground">{step.detail}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SimpleModeOffcutLabels({
  offcutLabelBands,
  surfaceX,
  surfaceY,
  scale,
  displayRotated,
  zoom = 1,
}: {
  offcutLabelBands: OffcutBand[]
  surfaceX: number
  surfaceY: number
  scale: number
  /**
   * When the parent `<g>` is rotated -90° (tall sheet display
   * rotation), each label `<text>` counter-rotates around its own
   * (centerX, centerY) so "Reusable offcut" + dims read upright.
   */
  displayRotated?: boolean
  /**
   * SheetSvg zoom factor. The label-size caps divide by zoom so a
   * label that hits the cap stays at constant screen-pixel size as
   * the operator zooms in.
   */
  zoom?: number
}) {
  return (
    <>
      {offcutLabelBands.map((band, index) => {
        // For polygon bands, use centroid; for rect bands, use bounding box center
        let centerX: number
        let centerY: number
        if (band.polygon && band.polygon.length > 0) {
          let cx = 0
          let cy = 0
          for (const pt of band.polygon) {
            cx += pt.x
            cy += pt.y
          }
          centerX = surfaceX + (cx / band.polygon.length) * scale
          centerY = surfaceY + (cy / band.polygon.length) * scale
        } else {
          centerX = surfaceX + (band.x + band.width / 2) * scale
          centerY = surfaceY + (band.y + band.height / 2) * scale
        }
        const dims = `${formatInches(band.width)}" \u00D7 ${formatInches(band.height)}"`
        const bandPxW = band.width * scale
        const bandPxH = band.height * scale
        const titleSize = Math.max(0, Math.min(13 / zoom, bandPxW * 0.12, bandPxH * 0.25))
        const dimsSize = Math.max(0, Math.min(11 / zoom, bandPxW * 0.1, bandPxH * 0.2))

        return (
          <text
            key={`offcut-label-${index + 1}`}
            x={centerX}
            y={centerY}
            transform={displayRotated ? `rotate(90 ${centerX} ${centerY})` : undefined}
            textAnchor="middle"
            // Slate-900 reads cleanly on the cream offcut fill
            // (Treatment 1). Dark-mode flips to amber-50 since the
            // cream fill darkens to amber-950 there.
            className="fill-slate-900 dark:fill-amber-50"
            fontWeight="600"
          >
            <tspan x={centerX} dy={-dimsSize * 0.6} fontSize={titleSize}>
              Reusable offcut
            </tspan>
            <tspan
              x={centerX}
              dy={titleSize + dimsSize * 0.3}
              fontSize={dimsSize}
              className="fill-slate-700 dark:fill-amber-100"
            >
              {dims}
            </tspan>
          </text>
        )
      })}
    </>
  )
}

// SimpleModeAdhesives extracted to nesting-viz-adhesives.tsx
export { SimpleModeAdhesives } from "./nesting-viz-adhesives"

// SimpleModeDimensionLabels extracted to nesting-viz-dimension-labels.tsx
export { SimpleModeDimensionLabels } from "./nesting-viz-dimension-labels"
