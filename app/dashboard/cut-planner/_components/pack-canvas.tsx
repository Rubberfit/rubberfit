"use client"

import { AlertCircle, Package } from "lucide-react"
import { Button } from "@/app/components/ui/button"
import NestingVisualizer from "./NestingVisualizer"
import { PackProgress, type PackProgressView } from "./pack-progress"
import type { SimpleCutMetrics } from "./nesting-visualizer-types"
import type { PackJobResult, PackJobStatus } from "../_hooks/use-pack-job"

interface PackCanvasProps {
  status: PackJobStatus
  progress: PackProgressView
  result: PackJobResult | null
  error: string | null
  stockWidth: number
  stockLength: number
  onMetricsChange: (metrics: SimpleCutMetrics) => void
  onRetry: () => void
}

export function PackCanvas({
  status,
  progress,
  result,
  error,
  stockWidth,
  stockLength,
  onMetricsChange,
  onRetry,
}: PackCanvasProps) {
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
  if (status === "done" && result) {
    return (
      <NestingVisualizer
        rollWidth={stockWidth}
        rollLength={stockLength}
        multiSheet={result.multiSheet}
        onMetricsChange={onMetricsChange}
      />
    )
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
