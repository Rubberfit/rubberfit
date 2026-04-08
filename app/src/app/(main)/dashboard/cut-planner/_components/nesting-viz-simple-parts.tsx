// Simple mode sub-components for NestingVizSimpleMode
// Split from nesting-viz-simple-mode.tsx to keep files under 500 lines

import React from "react"
import type { SimplePartPreview, OffcutBand, MultiSheetResult } from "./nesting-visualizer-types"
import { formatInches } from "./nesting-layout-utils"
import type { SimpleModeLayout } from "./nesting-viz-simple-layout"

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
}) {
  const { isMultiSheet, showReusable, reusablePctDisplay, scrapPctDisplay } = computeHeaderMetrics(
    multiSheet,
    reusableOffcutSqFt,
    reusableOffcutPct,
    scrapPct
  )

  return (
    <div className="border-b border-border bg-[#1b1b19] px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-stone-50">{"Rubber Sheet Nesting Layout"}</div>
          <div className="text-xs text-stone-300">{previewTitle}</div>
          <div className="mt-1 text-xs text-stone-400">{layoutNote}</div>
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
        <rect width="18" height="18" fill="#242420" />
        <line x1="0" y1="0" x2="0" y2="18" stroke="rgba(120,113,108,0.22)" strokeWidth="1.5" />
      </pattern>
      <pattern
        id={offcutPatternId}
        width="14"
        height="14"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="14" height="14" fill="#332c1f" />
        <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(245,158,11,0.5)" strokeWidth="2" />
      </pattern>
      <pattern
        id={wastePatternId}
        width="14"
        height="14"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="14" height="14" fill="#312726" />
        <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(239,68,68,0.5)" strokeWidth="2" />
      </pattern>
      <pattern
        id={usablePatternId}
        width="18"
        height="18"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(-32)"
      >
        <rect width="18" height="18" fill="#2f3426" />
        <line x1="0" y1="0" x2="0" y2="18" stroke="rgba(132,204,22,0.45)" strokeWidth="2" />
      </pattern>
      <marker id={markerId} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#d6d3d1" />
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
            displayScore >= 80
              ? "text-green-600"
              : displayScore >= 60
                ? "text-amber-600"
                : "text-red-600"
          }`}
        >
          {displayScore}/100
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
}: {
  offcutLabelBands: OffcutBand[]
  surfaceX: number
  surfaceY: number
  scale: number
}) {
  return (
    <>
      {offcutLabelBands.map((band, index) => {
        const centerX = surfaceX + (band.x + band.width / 2) * scale
        const centerY = surfaceY + (band.y + band.height / 2) * scale
        const dims = `${formatInches(band.width)}" \u00D7 ${formatInches(band.height)}"`
        const bandPxW = band.width * scale
        const bandPxH = band.height * scale
        const titleSize = Math.max(0, Math.min(13, bandPxW * 0.12, bandPxH * 0.25))
        const dimsSize = Math.max(0, Math.min(11, bandPxW * 0.1, bandPxH * 0.2))

        return (
          <text
            key={`offcut-label-${index + 1}`}
            x={centerX}
            y={centerY}
            textAnchor="middle"
            fill="#d6d3d1"
            fontWeight="500"
          >
            <tspan x={centerX} dy={-dimsSize * 0.6} fontSize={titleSize}>
              Reusable offcut
            </tspan>
            <tspan
              x={centerX}
              dy={titleSize + dimsSize * 0.3}
              fontSize={dimsSize}
              fill="#fbbf24"
            >
              {dims}
            </tspan>
          </text>
        )
      })}
    </>
  )
}

export function SimpleModeDimensionLabels({ layout }: { layout: SimpleModeLayout }) {
  return (
    <>
      <line
        x1={layout.shapeFirstView ? layout.localBlankX : layout.surfaceX}
        y1={layout.rowLabelY}
        x2={
          layout.shapeFirstView
            ? layout.localBlankX + layout.localBlankW
            : layout.surfaceX + layout.surfacePxW
        }
        y2={layout.rowLabelY}
        stroke="#d6d3d1"
        strokeWidth="1.5"
        markerStart={`url(#${layout.markerId})`}
        markerEnd={`url(#${layout.markerId})`}
      />
      <text
        x={
          layout.shapeFirstView
            ? layout.localBlankX + layout.localBlankW / 2
            : layout.surfaceX + layout.surfacePxW / 2
        }
        y={layout.rowLabelY + 24}
        textAnchor="middle"
        fill="#e7e5e4"
        fontSize="14"
        fontWeight="600"
      >
        {`${formatInches(layout.previewRollW)}" stock width`}
      </text>

      <line
        x1={layout.colLabelX}
        y1={layout.shapeFirstView ? layout.localBlankY : layout.surfaceY}
        x2={layout.colLabelX}
        y2={
          layout.shapeFirstView
            ? layout.localBlankY + layout.localBlankH
            : layout.surfaceY + layout.surfacePxH
        }
        stroke="#d6d3d1"
        strokeWidth="1.5"
        markerStart={`url(#${layout.markerId})`}
        markerEnd={`url(#${layout.markerId})`}
      />
      <text
        x={layout.colLabelX + 26}
        y={
          layout.shapeFirstView
            ? layout.localBlankY + layout.localBlankH / 2
            : layout.surfaceY + layout.surfacePxH / 2
        }
        textAnchor="middle"
        fill="#e7e5e4"
        fontSize="14"
        fontWeight="600"
        transform={`rotate(90 ${layout.colLabelX + 26} ${layout.shapeFirstView ? layout.localBlankY + layout.localBlankH / 2 : layout.surfaceY + layout.surfacePxH / 2})`}
      >
        {`${formatInches(layout.previewRollL)}" height`}
      </text>
    </>
  )
}
