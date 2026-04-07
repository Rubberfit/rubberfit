// Simple mode render for NestingVisualizer
// Extracted from NestingVisualizer.tsx
// Sub-components live in nesting-viz-simple-parts.tsx

import React from "react"
import type { PreviewItem } from "./nesting-visualizer-types"
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
      />

      <div className="overflow-x-auto bg-[#232320] px-2 py-4 sm:px-4">
        <svg
          viewBox={`0 0 ${layout.viewWidth} ${layout.viewHeight}`}
          className="mx-auto block w-full max-w-6xl rounded-xl"
        >
          <SimpleModePatternDefs
            stockPatternId={layout.stockPatternId}
            offcutPatternId={layout.offcutPatternId}
            wastePatternId={layout.wastePatternId}
            usablePatternId={layout.usablePatternId}
            markerId={layout.markerId}
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
            fill={`url(#${layout.stockPatternId})`}
            stroke="#d6d3d1"
            strokeWidth="2"
          />

          {!layout.shapeFirstView &&
            layout.displayPreview.offcutBands.map((band, index) => (
              <rect
                key={`band-${index + 1}`}
                x={layout.surfaceX + band.x * layout.scale}
                y={layout.surfaceY + band.y * layout.scale}
                width={band.width * layout.scale}
                height={band.height * layout.scale}
                fill={`url(#${layout.offcutPatternId})`}
                opacity="0.95"
              />
            ))}

          {!layout.shapeFirstView &&
            layout.displayPreview.scrapBands.map((band, index) => (
              <rect
                key={`scrap-band-${index + 1}`}
                x={layout.surfaceX + band.x * layout.scale}
                y={layout.surfaceY + band.y * layout.scale}
                width={band.width * layout.scale}
                height={band.height * layout.scale}
                fill={`url(#${layout.wastePatternId})`}
                opacity="0.95"
              />
            ))}

          {layout.displayItems.map((item, index) => (
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
              displayPreview={layout.displayPreview}
              usablePatternId={layout.usablePatternId}
              wastePatternId={layout.wastePatternId}
              viewHeight={layout.viewHeight}
              surfacePxW={layout.surfacePxW}
            />
          ))}

          <SimpleModeOffcutLabels
            offcutLabelBands={layout.offcutLabelBands}
            surfaceX={layout.surfaceX}
            surfaceY={layout.surfaceY}
            scale={layout.scale}
          />

          <SimpleModeDimensionLabels layout={layout} />
        </svg>
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
      />

      <SimpleModeFooter
        metricsAreEstimatedFromStock={layout.metricsAreEstimatedFromStock}
        stockSqFt={layout.stockSqFt}
        displayPreview={layout.displayPreview}
        isSplitStockPreview={layout.isSplitStockPreview}
        missingCutPieceCount={layout.missingCutPieceCount}
      />

      {layout.showCutPlan && <SimpleModeCutPlan displayPreview={layout.displayPreview} />}
    </div>
  )
}
