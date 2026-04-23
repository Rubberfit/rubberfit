"use client"

import {
  RefreshCw, Settings, CheckCircle2, AlertTriangle, XCircle, Circle,
  Database, Globe, HardDrive, KeyRound, ListChecks,
} from "lucide-react"
import { cn } from "@/app/lib/utils"
import { useEndpoints } from "../_hooks/use-endpoints"
import type { EndpointStatus, CheckType, Endpoint } from "../_hooks/use-endpoints"

const CHECK_TYPE_ICON: Record<CheckType, React.ElementType> = {
  db:      Database,
  auth:    KeyRound,
  storage: HardDrive,
  queue:   ListChecks,
  http:    Globe,
}

 
// Style maps

const ENDPOINT_BAR_COLOR: Record<EndpointStatus, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
  unknown: "bg-zinc-600",
}

const ENDPOINT_STATUS_BADGE: Record<EndpointStatus, string> = {
  operational: "text-emerald-400 bg-emerald-900/40 border border-emerald-800",
  degraded: "text-amber-400 bg-amber-900/40 border border-amber-800",
  down: "text-red-400 bg-red-900/40 border border-red-800",
  unknown: "text-zinc-400 bg-zinc-800 border border-zinc-700",
}

const ENDPOINT_STATUS_LABEL: Record<EndpointStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
}

const ENDPOINT_STATUS_ICON: Record<EndpointStatus, React.ElementType> = {
  operational: CheckCircle2,
  degraded: AlertTriangle,
  down: XCircle,
  unknown: Circle,
}

// Main component

interface HealthEndPointProps {
  onRunChecks?: () => void
}

export function HealthEndPoint({ onRunChecks }: HealthEndPointProps) {
  const { endpoints, isLoading, isRunning, error, runChecks } = useEndpoints()

  const handleRunChecks = async () => {
    await runChecks()
    onRunChecks?.()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {endpoints.length} configurable endpoints. Click the gear icon to edit connection details.
        </p>
        <button
          onClick={() => void handleRunChecks()}
          disabled={isRunning}
          className="flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 bg-violet-900/30 hover:bg-violet-900/50 border border-violet-800/60 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={cn("w-3 h-3", isRunning && "animate-spin")} />
          {isRunning ? "Running…" : "Run All Checks"}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-2.5">
          {error}
        </p>
      )}

      {/* Loading state */}
      {isLoading && endpoints.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 h-48 animate-pulse"
            />
          ))}
        </div>
      ) : (
        /* Endpoints grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {endpoints.map((ep: Endpoint) => {
            const StatusIcon = ENDPOINT_STATUS_ICON[ep.status]
            const TypeIcon = CHECK_TYPE_ICON[ep.checkType]
            return (
              <div
                key={ep.id}
                className="relative overflow-hidden bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3 hover:border-zinc-700 transition-colors"
              >
                <div className={cn("absolute w-[3px] inset-y-0 left-0", ENDPOINT_BAR_COLOR[ep.status])} />
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                      <TypeIcon className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-200 leading-tight">
                        {ep.service}
                      </p>
                      <p className="text-[11px] text-zinc-500 font-mono mt-0.5">{ep.method}</p>
                    </div>
                  </div>
                  <button className="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0">
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-zinc-500 leading-snug">{ep.description}</p>
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon
                      className={cn("w-3.5 h-3.5", {
                        "text-emerald-400": ep.status === "operational",
                        "text-amber-400": ep.status === "degraded",
                        "text-red-400": ep.status === "down",
                        "text-zinc-500": ep.status === "unknown",
                      })}
                    />
                    <span
                      className={cn("text-xs font-semibold", {
                        "text-emerald-400": ep.status === "operational",
                        "text-amber-400": ep.status === "degraded",
                        "text-red-400": ep.status === "down",
                        "text-zinc-500": ep.status === "unknown",
                      })}
                    >
                      {ENDPOINT_STATUS_LABEL[ep.status]}
                    </span>
                    {ep.status !== "operational" && ep.status !== "unknown" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                    {ep.responseTime !== null && (
                      <span className="font-mono text-zinc-400">{ep.responseTime}</span>
                    )}
                    <span>{ep.lastChecked}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}