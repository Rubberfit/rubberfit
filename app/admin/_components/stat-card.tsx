import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  label: string
  value: string
  delta?: string
  deltaPositive?: boolean
  icon: LucideIcon
}

export function StatCard({ label, value, delta, deltaPositive, icon: Icon }: StatCardProps) {
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
        {delta !== undefined && (
          <span
            className={`text-xs font-medium ${deltaPositive ? "text-emerald-400" : "text-red-400"}`}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  )
}
