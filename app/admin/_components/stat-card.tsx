import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  label: string
  value: string
  delta?: string
  /**
   * Tri-state direction of the delta:
   *   - `true` → green (improving)
   *   - `false` → red (regressing)
   *   - `undefined` → neutral grey (unknown / flat). Defaulting to
   *     red on unknown misrepresents stable-state metrics as
   *     negative, which was surfaced as a CR issue.
   */
  deltaPositive?: boolean
  icon: LucideIcon
}

export function StatCard({ label, value, delta, deltaPositive, icon: Icon }: StatCardProps) {
  const deltaClass =
    deltaPositive === true
      ? "text-emerald-400"
      : deltaPositive === false
        ? "text-red-400"
        : "text-zinc-400"
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</span>
        <div className="w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center">
          <Icon className="w-4 h-4 text-zinc-400" />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-zinc-100 tabular-nums">{value}</span>
        {delta !== undefined && <span className={`text-xs font-medium ${deltaClass}`}>{delta}</span>}
      </div>
    </div>
  )
}
