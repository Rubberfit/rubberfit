"use client"

import { Progress } from "@/app/components/ui/progress"
import type { GreedyPackProgress } from "../_hooks/use-greedy-pack-job"

const STAGE_LABELS: Record<GreedyPackProgress["stage"], string> = {
  starting: "Preparing shapes",
  packing: "Packing shapes",
  done: "Finishing up",
}

const STAGE_PERCENT: Record<GreedyPackProgress["stage"], number> = {
  starting: 10,
  packing: 60,
  done: 100,
}

interface PackProgressProps {
  progress: GreedyPackProgress
}

export function PackProgress({ progress }: PackProgressProps) {
  const label = STAGE_LABELS[progress.stage]
  const percent = STAGE_PERCENT[progress.stage]
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-8 py-10 dark:bg-slate-800/40">
      <div className="w-full max-w-md space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
          <span className="tabular-nums text-slate-500 dark:text-slate-400">{percent}%</span>
        </div>
        <Progress value={percent} />
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Packing runs on a background thread — UI stays responsive.
        </p>
      </div>
    </div>
  )
}
