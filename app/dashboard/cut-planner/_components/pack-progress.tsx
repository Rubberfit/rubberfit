"use client"

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
          Packing runs on a background thread — UI stays responsive.
        </p>
      </div>
    </div>
  )
}
