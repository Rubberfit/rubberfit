"use client"

import { RefreshCw } from "lucide-react"
import { cn } from "@/app/lib/utils"
import { Sparkline } from "@/app/admin/_components/sparkline"
import type { HealthService, HealthIncident, ServiceStatus } from "../_hooks/use-health-status"

// Props

interface OverviewPanelProps {
  services:    HealthService[]
  incidents:   HealthIncident[]
  isLoading:   boolean
  isRunning:   boolean
  lastChecked: string | null
  error:       string | null
  onRunChecks: () => void
}

// Style maps

const STATUS_BAR: Record<ServiceStatus, string> = {
  HEALTHY:  "bg-emerald-500",
  DEGRADED: "bg-amber-500",
  DOWN:     "bg-red-500",
  UNKNOWN:  "bg-zinc-600",
}

const STATUS_DOT: Record<ServiceStatus, string> = {
  HEALTHY:  "bg-emerald-400",
  DEGRADED: "bg-amber-400 animate-pulse",
  DOWN:     "bg-red-400 animate-pulse",
  UNKNOWN:  "bg-zinc-500",
}

const STATUS_TEXT: Record<ServiceStatus, string> = {
  HEALTHY:  "text-emerald-400",
  DEGRADED: "text-amber-400",
  DOWN:     "text-red-400",
  UNKNOWN:  "text-zinc-500",
}

const STATUS_SPARKLINE: Record<ServiceStatus, "operational" | "degraded" | "down" | "unknown"> = {
  HEALTHY:  "operational",
  DEGRADED: "degraded",
  DOWN:     "down",
  UNKNOWN:  "unknown",
}

const SEVERITY_DOT: Record<string, string> = {
  High:   "bg-red-400",
  Medium: "bg-amber-400",
  Low:    "bg-sky-400",
}

const SEVERITY_TEXT: Record<string, string> = {
  High:   "text-red-400",
  Medium: "text-amber-400",
  Low:    "text-sky-400",
}

const INCIDENT_STATUS_STYLES: Record<string, string> = {
  Active:        "text-red-400",
  Investigating: "text-amber-400",
  Resolved:      "text-zinc-500",
}

const ENV_STYLES: Record<string, string> = {
  Production: "text-emerald-300 bg-emerald-900/40",
  Staging:    "text-sky-300 bg-sky-900/40",
}

// SystemBanner

function SystemBanner({ services }: { services: HealthService[] }) {
  const degraded = services.filter(s => s.status === "DEGRADED").length
  const down     = services.filter(s => s.status === "DOWN").length
  const unknown  = services.filter(s => s.status === "UNKNOWN").length

  if (services.length === 0 || unknown === services.length) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/60 border border-zinc-700 rounded-lg">
        <span className="w-2 h-2 rounded-full bg-zinc-500 shrink-0" />
        <span className="text-xs font-medium text-zinc-400">No checks run yet — click Run Checks to get started</span>
      </div>
    )
  }
  if (degraded === 0 && down === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-950/60 border border-emerald-900/50 rounded-lg">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <span className="text-xs font-medium text-emerald-300">All systems operational</span>
      </div>
    )
  }
  const parts: string[] = []
  if (down     > 0) parts.push(`${down} service${down > 1 ? "s" : ""} down`)
  if (degraded > 0) parts.push(`${degraded} degraded`)
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-950/40 border border-amber-900/40 rounded-lg">
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
      <span className="text-xs font-medium text-amber-300">
        {parts.join(" · ")} — System partially operational
      </span>
    </div>
  )
}

//  OverviewPanel

export function OverviewPanel({ services, incidents, isLoading, isRunning, lastChecked, error, onRunChecks }: OverviewPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <SystemBanner services={services} />
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {lastChecked && (
            <span className="text-[11px] text-zinc-500 hidden sm:block">
              Last run: {new Date(lastChecked).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={onRunChecks}
            disabled={isRunning}
            className="flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 bg-violet-900/30 hover:bg-violet-900/50 border border-violet-800/60 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={cn("w-3 h-3", isRunning && "animate-spin")} />
            {isRunning ? "Running…" : "Run Checks"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-2.5">{error}</p>
      )}

      {/* Service grid */}
      {isLoading && services.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 h-40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {services.map((svc) => (
            <div key={svc.name} className="relative overflow-hidden bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
              <div className={cn("absolute w-[3px] inset-y-0 left-0", STATUS_BAR[svc.status])} />
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-200">{svc.name}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ENV_STYLES[svc.env] ?? ""}`}>
                  {svc.env}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[svc.status])} />
                <span className={cn("text-xs font-semibold", STATUS_TEXT[svc.status])}>
                  {svc.status.charAt(0) + svc.status.slice(1).toLowerCase()}
                </span>
              </div>
              <Sparkline status={STATUS_SPARKLINE[svc.status]} height={36} data={svc.sparklineData} />
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-800">
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Uptime</p>
                  <p className="text-sm font-semibold text-zinc-200 mt-0.5">{svc.uptime}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Latency</p>
                  <p className="text-sm font-semibold text-zinc-200 mt-0.5">{svc.latency}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Last Check</p>
                  <p className="text-sm font-semibold text-zinc-200 mt-0.5">{svc.lastIncident}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Incident timeline */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Incident Log</h2>
        </div>
        {incidents.length === 0 ? (
          <p className="px-4 py-6 text-xs text-zinc-500 text-center">No incidents recorded yet.</p>
        ) : (
          <div className="relative flex flex-col gap-0 px-4 pb-4">
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-zinc-800" />
            {incidents.map((inc, i) => (
              <div key={i} className="relative flex gap-4 py-3 last:pb-0">
                <div className={cn("w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 z-10 border-2 border-zinc-950", SEVERITY_DOT[inc.severity])} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5">
                    <span className="text-xs font-mono text-zinc-500">{inc.time}</span>
                    <span className="text-xs font-semibold text-zinc-300">{inc.service}</span>
                    <span className={cn("text-[10px] font-bold uppercase tracking-wide", SEVERITY_TEXT[inc.severity])}>
                      {inc.severity}
                    </span>
                    <span className={cn("text-[10px] font-semibold ml-auto", INCIDENT_STATUS_STYLES[inc.incidentStatus] ?? "text-zinc-500")}>
                      {inc.incidentStatus}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">{inc.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
