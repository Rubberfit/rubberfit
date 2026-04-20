"use client"

/**
 * Packing progress indicator shown in the Graph card while the
 * cut-planner runs the nesting pipeline.
 *
 * Pattern ported from the `103-remove-live-loading` branch on main:
 * the UI no longer recomputes cuts on every keystroke. Operators
 * configure parts + stock, then press **Pack** once to run the
 * solver. The loader below is shown between press and result,
 * signaling "work happening" — without live churn, operators get
 * more accurate layouts and less material waste from half-finalized
 * inputs.
 *
 * Kept presentational on purpose. The gating state lives in
 * `use-pack-gate.ts`; the page mounts `NestingVisualizer` only
 * after this component has surrendered the viewport.
 */

import { Progress } from "@/app/components/ui/progress"

export interface PackProgressView {
  label: string
  percent: number
  detail?: string
}

interface PackProgressProps {
  progress: PackProgressView
}

export function PackProgress({ progress }: PackProgressProps) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-8 py-10 dark:bg-slate-800/40">
      <div className="w-full max-w-md space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {progress.label}
            {progress.detail && (
              <span className="text-slate-500 dark:text-slate-400"> — {progress.detail}</span>
            )}
          </span>
          <span className="tabular-nums text-slate-500 dark:text-slate-400">
            {Math.round(progress.percent)}%
          </span>
        </div>
        <Progress value={progress.percent} />
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Packing the layout — hold tight, this takes a moment.
        </p>
      </div>
    </div>
  )
}
