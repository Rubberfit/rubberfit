// Simple mode render for NestingVisualizer
// Extracted from NestingVisualizer.tsx
// Sub-components live in nesting-viz-simple-parts.tsx

import React from "react"
import type { PreviewItem, MultiSheetResult, SheetPreview } from "./nesting-visualizer-types"
import type { NestingResult } from "@/lib/nesting/types"
import NestingShapeRenderer from "./nesting-shape-renderer"
import {
  SimpleModeHeader,
  SimpleModePatternDefs,
  SimpleModeMetrics,
  SimpleModeFooter,
  SimpleModeCutPlan,
  SimpleModeOffcutLabels,
  SimpleModeDimensionLabels,
} from "./nesting-viz-simple-parts"
import { computeSimpleModeLayout, formatInches } from "./nesting-viz-simple-layout"
import type { SimplePartPreview } from "./nesting-visualizer-types"
import type { SimpleModeLayout } from "./nesting-viz-simple-layout"

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
  tagMap?: Map<string, string>
}

function SheetSvg({
  sheet,
  layout,
  preview,
  previewRollW,
  previewRollL,
  isMultiSheet,
  totalSheets,
  tagMap,
}: {
  sheet: SheetPreview
  layout: SimpleModeLayout
  preview: SimplePartPreview
  previewRollW: number
  previewRollL: number
  isMultiSheet: boolean
  totalSheets: number
  tagMap?: Map<string, string>
}) {
  const sPat = sheet.sheetIndex > 0 ? `-s${sheet.sheetIndex}` : ""
  const sStockPat = `${layout.stockPatternId}${sPat}`
  const sOffcutPat = `${layout.offcutPatternId}${sPat}`
  const sWastePat = `${layout.wastePatternId}${sPat}`
  const sUsablePat = `${layout.usablePatternId}${sPat}`
  const sMarker = `${layout.markerId}${sPat}`

  return (
    <div className="relative">
      {isMultiSheet && (
        <div className="mb-1 text-center text-xs font-medium text-stone-400">
          Sheet {sheet.sheetIndex + 1} of {totalSheets}
          {sheet.isPartial ? " (partial)" : ""}
        </div>
      )}
      <svg
        viewBox={`0 0 ${layout.viewWidth} ${layout.viewHeight}`}
        className="mx-auto block w-full max-w-6xl rounded-xl"
      >
        <SimpleModePatternDefs
          stockPatternId={sStockPat}
          offcutPatternId={sOffcutPat}
          wastePatternId={sWastePat}
          usablePatternId={sUsablePat}
          markerId={sMarker}
        />
        <text
          x={layout.viewWidth / 2}
          y="34"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="20"
          fontWeight="700"
        >
          {"Rubber Sheet Nesting Layout"}
        </text>
        <text x={layout.viewWidth / 2} y="60" textAnchor="middle" fill="#f5f5f4" fontSize="12">
          {`Typical ${formatInches(previewRollW)}" \u00D7 ${formatInches(previewRollL)}" stock sheet`}
        </text>
        <rect
          x={layout.surfaceX}
          y={layout.surfaceY}
          width={layout.surfacePxW}
          height={layout.surfacePxH}
          rx="8"
          fill={`url(#${sStockPat})`}
          stroke="#d6d3d1"
          strokeWidth="2"
        />
        {!layout.shapeFirstView &&
          sheet.preview.offcutBands.map((band, index) => (
            <rect
              key={`band-${index + 1}`}
              x={layout.surfaceX + band.x * layout.scale}
              y={layout.surfaceY + band.y * layout.scale}
              width={band.width * layout.scale}
              height={band.height * layout.scale}
              fill={`url(#${sOffcutPat})`}
              opacity="0.95"
            />
          ))}
        {!layout.shapeFirstView &&
          sheet.preview.scrapBands.map((band, index) => (
            <rect
              key={`scrap-band-${index + 1}`}
              x={layout.surfaceX + band.x * layout.scale}
              y={layout.surfaceY + band.y * layout.scale}
              width={band.width * layout.scale}
              height={band.height * layout.scale}
              fill={`url(#${sWastePat})`}
              opacity="0.95"
            />
          ))}
        {sheet.preview.items.map((item, index) => (
          <NestingShapeRenderer
            key={index + 1}
            item={item}
            index={index}
            surfaceX={layout.surfaceX}
            surfaceY={layout.surfaceY}
            unitOriginX={layout.unitOriginX}
            unitOriginY={layout.unitOriginY}
            scale={layout.scale}
            shapeFirstView={layout.shapeFirstView}
            preview={preview}
            displayPreview={sheet.preview}
            usablePatternId={sUsablePat}
            wastePatternId={sWastePat}
            viewHeight={layout.viewHeight}
            surfacePxW={layout.surfacePxW}
            tagLetter={tagMap?.get(item.label)}
          />
        ))}
        <SimpleModeOffcutLabels
          offcutLabelBands={
            !layout.shapeFirstView && sheet.preview.offcutBands.length > 0
              ? [...sheet.preview.offcutBands]
                  .sort((a, b) => b.width * b.height - a.width * a.height)
                  .filter(
                    (band) => band.width * layout.scale > 42 && band.height * layout.scale > 14
                  )
              : []
          }
          surfaceX={layout.surfaceX}
          surfaceY={layout.surfaceY}
          scale={layout.scale}
        />
        <SimpleModeDimensionLabels layout={layout} />
      </svg>
    </div>
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
  tagMap,
}: SimpleModeProps) {
  const layout = computeSimpleModeLayout({
    preview,
    previewRollW,
    previewRollL,
    patternSeed,
    viewMode,
    optimizedResult,
    optimizedItems,
  })

  const isMultiSheet = (multiSheet?.sheets.length ?? 0) > 1
  const uniqueLabels = tagMap ? [...tagMap.keys()] : []
  const sheets = multiSheet?.sheets ?? [
    { sheetIndex: 0, preview: layout.displayPreview, isPartial: false },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <SimpleModeHeader
        previewTitle={layout.previewTitle}
        layoutNote={layout.layoutNote}
        displayPreview={layout.displayPreview}
        pieceCountLabel={layout.pieceCountLabel}
        pieceCountValue={layout.pieceCountValue}
        reusableOffcutSqFt={layout.reusableOffcutSqFt}
        reusableOffcutPct={layout.reusableOffcutPct}
        reusableMetricLabel={layout.reusableMetricLabel}
        scrapMetricLabel={layout.scrapMetricLabel}
        scrapPct={layout.scrapPct}
        isSplitStockPreview={layout.isSplitStockPreview}
        missingCutPieceCount={layout.missingCutPieceCount}
        isOptimizedResult={layout.isOptimizedResult}
        isOptimizing={isOptimizing}
        nfpError={nfpError}
        multiSheet={multiSheet}
      />

      {uniqueLabels.length > 0 && (
        <div className="flex flex-wrap gap-3 border-b border-border bg-[#1b1b19] px-4 py-2.5 text-xs text-stone-300">
          {uniqueLabels.map((label) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-stone-700 text-[10px] font-bold text-stone-50">
                {tagMap?.get(label)}
              </span>
              <span>{label}</span>
            </span>
          ))}
        </div>
      )}

      <div
        className={`bg-[#232320] px-2 py-4 sm:px-4 ${isMultiSheet ? "grid grid-cols-1 gap-4 md:grid-cols-2" : "overflow-x-auto"}`}
      >
        {sheets.map((sheet) => (
          <SheetSvg
            key={`sheet-${sheet.sheetIndex}`}
            sheet={sheet}
            layout={layout}
            preview={preview}
            previewRollW={previewRollW}
            previewRollL={previewRollL}
            isMultiSheet={isMultiSheet}
            totalSheets={sheets.length}
            tagMap={tagMap}
          />
        ))}
      </div>

      <SimpleModeMetrics
        displayPreview={layout.displayPreview}
        usedSqFt={layout.usedSqFt}
        reusableOffcutSqFt={layout.reusableOffcutSqFt}
        scrapSqFt={layout.scrapSqFt}
        reusableMetricLabel={layout.reusableMetricLabel}
        pieceCountLabel={layout.pieceCountLabel}
        pieceCountValue={layout.pieceCountValue}
        fabScore={layout.fabScore}
        multiSheet={multiSheet}
      />

      <SimpleModeFooter
        metricsAreEstimatedFromStock={layout.metricsAreEstimatedFromStock}
        stockSqFt={layout.stockSqFt}
        displayPreview={layout.displayPreview}
        isSplitStockPreview={layout.isSplitStockPreview}
        missingCutPieceCount={layout.missingCutPieceCount}
        multiSheet={multiSheet}
      />

      {layout.showCutPlan && <SimpleModeCutPlan displayPreview={layout.displayPreview} />}
    </div>
  )
}
