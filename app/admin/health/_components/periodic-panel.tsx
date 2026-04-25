"use client"

import { AlertTriangle, CheckCircle2, Circle, RefreshCw, Settings, XCircle } from "lucide-react"
import { cn } from "@/app/lib/utils"
import type { PeriodicCheck, UptimeSummary, CheckStatus } from "../_hooks/use-periodic-checks"

const STATUS_BADGE: Record<CheckStatus, string> = {
  operational: "text-emerald-400 bg-emerald-900/40 border border-emerald-800",
  degraded:    "text-amber-400 bg-amber-900/40 border border-amber-800",
  down:        "text-red-400 bg-red-900/40 border border-red-800",
  unknown:     "text-zinc-400 bg-zinc-800 border border-zinc-700",
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  operational: "Operational",
  degraded:    "Degraded",
  down:        "Down",
  unknown:     "Unknown",
}

const STATUS_ICON: Record<CheckStatus, React.ElementType> = {
  operational: CheckCircle2,
  degraded:    AlertTriangle,
  down:        XCircle,
  unknown:     Circle,
}

interface PeriodicPanelProps {
  checks:    PeriodicCheck[]
  uptime:    UptimeSummary | null
  isLoading: boolean
  error:     string | null
  onRefresh: () => void
}

function UptimeBar({ value }: { value: number }) {
  return (
    <div className="h-1 bg-zinc-800 rounded-full mt-1.5">
      <div
        className="h-full bg-emerald-500 rounded-full"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  )
}

function UptimeSkeleton() {
  return (
    <div className="grid grid-cols-3 divide-x divide-zinc-800">
      {[0, 1, 2].map((i) => (
        <div key={i} className="px-4 first:pl-0 last:pr-0 flex flex-col gap-1">
          <div className="h-3 w-20 bg-zinc-800 rounded animate-pulse" />
          <div className="h-7 w-16 bg-zinc-800 rounded animate-pulse" />
          <div className="h-1 w-full bg-zinc-800 rounded-full mt-1.5 animate-pulse" />
        </div>
      ))}
    </div>
  )
}

export function PeriodicPanel({ checks, uptime, isLoading, error, onRefresh }: PeriodicPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Schedule tiers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { tier: "Critical", services: "DB · Auth · Frontend",     interval: "Every 5 min",  borderClass: "border-red-900/60",   labelColor: "text-red-400"   },
          { tier: "Standard", services: "Edge Fn · Email · Stripe",  interval: "Every 15 min", borderClass: "border-amber-900/50", labelColor: "text-amber-400" },
          { tier: "Extended", services: "All services",              interval: "Every 30 min", borderClass: "border-sky-900/50",   labelColor: "text-sky-400"   },
        ].map((t) => (
          <div key={t.tier} className={cn("bg-zinc-950 border rounded-lg p-4 flex flex-col gap-2", t.borderClass)}>
            <div className="flex items-center justify-between">
              <span className={cn("text-xs font-bold uppercase tracking-wider", t.labelColor)}>{t.tier}</span>
              <button className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
                <Settings className="w-3 h-3" /> Edit
              </button>
            </div>
            <p className="text-sm font-semibold text-zinc-200">{t.interval}</p>
            <p className="text-[11px] text-zinc-500">{t.services}</p>
          </div>
        ))}
      </div>

      {/* Uptime summary */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Uptime Summary — <span className="text-zinc-400">admin.health_checks</span>
        </p>
        {isLoading ? (
          <UptimeSkeleton />
        ) : error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : (
          <div className="grid grid-cols-3 divide-x divide-zinc-800">
            {[
              { label: "Last 24 hours", value: uptime?.overall24h ?? 0 },
              { label: "Last 7 days",   value: uptime?.overall7d  ?? 0 },
              { label: "Last 30 days",  value: uptime?.overall30d ?? 0 },
            ].map((stat) => (
              <div key={stat.label} className="px-4 first:pl-0 last:pr-0 flex flex-col gap-0.5">
                <p className="text-[11px] text-zinc-500">{stat.label}</p>
                <p className="text-2xl font-bold text-zinc-100 tabular-nums">
                  {stat.value.toFixed(1)}%
                </p>
                <UptimeBar value={stat.value} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent check results */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-300">Recent Check Results</p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 font-mono">admin.health_checks</span>
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col divide-y divide-zinc-800/50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-2.5">
                <div className="h-3 w-24 bg-zinc-800 rounded animate-pulse" />
                <div className="h-3 w-28 bg-zinc-800 rounded animate-pulse" />
                <div className="h-5 w-20 bg-zinc-800 rounded animate-pulse" />
                <div className="h-3 w-12 bg-zinc-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="px-4 py-6 text-xs text-red-400">{error}</p>
        ) : checks.length === 0 ? (
          <p className="px-4 py-6 text-xs text-zinc-500">No check results yet. Run a check from the Overview tab.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  {["Checked", "Service", "Status", "Response", "Detail"].map((col) => (
                    <th key={col} className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checks.map((row) => {
                  const Icon = STATUS_ICON[row.status]
                  return (
                    <tr key={row.id} className={cn(
                      "border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors",
                      row.isTransition && "bg-amber-900/5"
                    )}>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                        {row.checkedAt}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-300 text-xs">{row.serviceName}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded", STATUS_BADGE[row.status])}>
                          <Icon className="w-3 h-3" />
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">
                        {row.responseMs !== null ? `${row.responseMs}ms` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-zinc-500 max-w-xs truncate">
                        {row.detail || "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
