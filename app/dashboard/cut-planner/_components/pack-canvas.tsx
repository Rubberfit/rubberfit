"use client"

import { useMemo } from "react"
import { AlertCircle, Package } from "lucide-react"
import { Button } from "@/app/components/ui/button"
import NestingVisualizer from "./NestingVisualizer"
import { PackProgress, type PackProgressView } from "./pack-progress"
import { computeFabricationScore } from "./nesting-preview-builders"
import type {
  MultiSheetResult,
  SimpleCutMetrics,
  SimplePartPreview,
} from "./nesting-visualizer-types"

export type PackStatus = "idle" | "packing" | "done" | "error"

interface PackCanvasProps {
  status: PackStatus
  progress: PackProgressView
  greedyPreview: SimplePartPreview | null
  nfpPreview: SimplePartPreview | null
  error: string | null
  stockWidth: number
  stockLength: number
  fallbackCutWidth: number
  fallbackCutHeight: number
  fallbackQty: number
  onMetricsChange: (metrics: SimpleCutMetrics) => void
  onRetry: () => void
}

function buildTwoSheetResult(
  greedy: SimplePartPreview,
  nfp: SimplePartPreview,
  stockWidth: number,
  stockLength: number
): MultiSheetResult {
  const stockArea = stockWidth * stockLength
  const greedyFab =
    greedy.fabricationScore ?? computeFabricationScore(greedy, stockWidth, stockLength).score
  const nfpFab = nfp.fabricationScore ?? computeFabricationScore(nfp, stockWidth, stockLength).score

  return {
    sheets: [
      { sheetIndex: 0, preview: greedy, isPartial: greedy.overflowUnits > 0 },
      { sheetIndex: 1, preview: nfp, isPartial: nfp.overflowUnits > 0 },
    ],
    totalUnitsCompleted: greedy.unitsCompleted + nfp.unitsCompleted,
    totalUsedArea: greedy.usedArea + nfp.usedArea,
    totalReusableArea: greedy.reusableArea + nfp.reusableArea,
    totalScrapArea: greedy.scrapArea + nfp.scrapArea,
    totalStockArea: stockArea * 2,
    remainingOverflow: greedy.overflowUnits + nfp.overflowUnits,
    avgFabScore: Math.round((greedyFab + nfpFab) / 2),
  }
}

export function PackCanvas({
  status,
  progress,
  greedyPreview,
  nfpPreview,
  error,
  stockWidth,
  stockLength,
  fallbackCutWidth,
  fallbackCutHeight,
  fallbackQty,
  onMetricsChange,
  onRetry,
}: PackCanvasProps) {
  const multiSheet = useMemo(() => {
    if (!greedyPreview || !nfpPreview) return null
    return buildTwoSheetResult(greedyPreview, nfpPreview, stockWidth, stockLength)
  }, [greedyPreview, nfpPreview, stockWidth, stockLength])

  if (status === "packing") return <PackProgress progress={progress} />
  if (status === "error") {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50/60 py-10 text-center dark:border-red-900 dark:bg-red-950/30">
        <AlertCircle className="h-6 w-6 text-red-500" />
        <div className="text-base font-semibold text-red-700 dark:text-red-300">Packing failed</div>
        <div className="max-w-md text-sm text-red-600 dark:text-red-400">
          {error ?? "Unknown error"}
        </div>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }

  if (status === "done") {
    const singlePreview = greedyPreview ?? nfpPreview
    if (multiSheet) {
      return (
        <NestingVisualizer
          defaultRollWidth={stockWidth}
          defaultRollLength={stockLength}
          defaultCutWidth={fallbackCutWidth}
          defaultCutHeight={fallbackCutHeight}
          defaultQty={fallbackQty}
          simpleMode
          overrideMultiSheet={multiSheet}
          onMetricsChange={onMetricsChange}
        />
      )
    }
    if (singlePreview) {
      return (
        <NestingVisualizer
          defaultRollWidth={stockWidth}
          defaultRollLength={stockLength}
          defaultCutWidth={fallbackCutWidth}
          defaultCutHeight={fallbackCutHeight}
          defaultQty={fallbackQty}
          simpleMode
          overridePreview={singlePreview}
          onMetricsChange={onMetricsChange}
        />
      )
    }
  }

  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 py-10 text-center dark:bg-slate-800/40">
      <Package className="h-6 w-6 text-slate-400" />
      <div className="text-base font-semibold text-slate-900 dark:text-slate-300">
        Ready to pack
      </div>
      <div className="max-w-md text-sm text-slate-600 dark:text-slate-400">
        Click <strong>Pack</strong> above to compute the layout. Changing any part or stock setting
        invalidates the previous result.
      </div>
    </div>
  )
}
