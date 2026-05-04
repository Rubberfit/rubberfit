"use client"

import { useState } from "react"
import {
  Activity, ChevronDown, Database, Globe, HardDrive,
  KeyRound, LayoutGrid, List, ListChecks, RefreshCw,
} from "lucide-react"

import { cn } from "@/app/lib/utils"
import { Sparkline } from "@/app/admin/_components/sparkline"
import { useDashboardHealth } from "@/app/admin/_hooks/use-dashboard-health"
import type { DashboardService, DashboardIncident } from "@/app/admin/_hooks/use-dashboard-health"

// Types

type EndpointStatus = "operational" | "degraded" | "down" | "unknown"
type LayoutMode = "grid" | "list"

// Helpers

const CHECK_TYPE_ICON: Record<string, React.ElementType> = {
  db:      Database,
  auth:    KeyRound,
  storage: HardDrive,
  queue:   ListChecks,
  http:    Globe,
}

function toStatus(raw: string | null): EndpointStatus {
  if (raw === "operational") return "operational"
  if (raw === "degraded")    return "degraded"
  if (raw === "down")        return "down"
  return "unknown"
}

function fmtUptime(val: number | null): string {
  if (val === null) return "—"
  return `${val.toFixed(1)}%`
}

function fmtRelative(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)  return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24)  return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

const STATUS_DOT: Record<EndpointStatus, string> = {
  operational: "bg-emerald-400",
  degraded:    "bg-amber-400",
  down:        "bg-red-400",
  unknown:     "bg-zinc-500",
}

const STATUS_LABEL: Record<EndpointStatus, string> = {
  operational: "Operational",
  degraded:    "Degraded",
  down:        "Down",
  unknown:     "Unknown",
}

const STATUS_TEXT_COLOR: Record<EndpointStatus, string> = {
  operational: "text-emerald-400",
  degraded:    "text-amber-400",
  down:        "text-red-400",
  unknown:     "text-zinc-500",
}

const STATUS_BADGE: Record<EndpointStatus, string> = {
  operational: "text-emerald-400 bg-emerald-900/40 border border-emerald-800",
  degraded:    "text-amber-400 bg-amber-900/40 border border-amber-800",
  down:        "text-red-400 bg-red-900/40 border border-red-800",
  unknown:     "text-zinc-400 bg-zinc-800 border border-zinc-700",
}

const STATUS_LEFT_BAR: Record<EndpointStatus, string> = {
  operational: "bg-emerald-500",
  degraded:    "bg-amber-500",
  down:        "bg-red-500",
  unknown:     "bg-zinc-600",
}

const INCIDENT_TYPE_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  down:        { dot: "bg-red-400",     label: "Down",        text: "text-red-400"     },
  degraded:    { dot: "bg-amber-400",   label: "Degraded",    text: "text-amber-400"   },
  operational: { dot: "bg-emerald-400", label: "Recovered",   text: "text-emerald-400" },
  unknown:     { dot: "bg-zinc-500",    label: "Unknown",     text: "text-zinc-500"    },
}

const LAYOUT_BUTTONS: { mode: LayoutMode; icon: React.ElementType; label: string }[] = [
  { mode: "grid", icon: LayoutGrid, label: "Grid" },
  { mode: "list", icon: List,       label: "List" },
]

// Uptime badges

function UptimeBadges({ svc }: { svc: DashboardService }) {
  const slots = [
    { label: "24h", value: fmtUptime(svc.uptime24h), raw: svc.uptime24h },
    { label: "7d",  value: fmtUptime(svc.uptime7d),  raw: svc.uptime7d  },
    { label: "30d", value: fmtUptime(svc.uptime30d), raw: svc.uptime30d },
  ]
  return (
    <div className="grid grid-cols-3 gap-1">
      {slots.map((u) => (
        <div key={u.label} className="bg-zinc-900 rounded px-2 py-1.5 text-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{u.label}</p>
          <p className={cn("text-xs font-bold mt-0.5", {
            "text-emerald-400": u.raw !== null && u.raw >= 99,
            "text-amber-400":   u.raw !== null && u.raw >= 95 && u.raw < 99,
            "text-red-400":     u.raw !== null && u.raw < 95,
            "text-zinc-500":    u.raw === null,
          })}>
            {u.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// Skeleton card

function SkeletonCard() {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-zinc-800" />
          <div className="h-4 w-28 bg-zinc-800 rounded" />
        </div>
        <div className="h-3 w-20 bg-zinc-800 rounded" />
      </div>
      <div className="h-10 bg-zinc-800 rounded" />
      <div className="grid grid-cols-3 gap-1">
        {[0,1,2].map(i => <div key={i} className="h-9 bg-zinc-800 rounded" />)}
      </div>
    </div>
  )
}

// Incident timeline

function IncidentTimeline({ incidents, isLoading }: { incidents: DashboardIncident[]; isLoading: boolean }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-zinc-200">Incident Timeline</h3>
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0,1,2].map(i => (
            <div key={i} className="flex gap-4 animate-pulse">
              <div className="w-3.5 h-3.5 rounded-full bg-zinc-800 shrink-0 mt-0.5" />
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="h-3 w-40 bg-zinc-800 rounded" />
                <div className="h-3 w-56 bg-zinc-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : incidents.length === 0 ? (
        <p className="text-xs text-zinc-500">No status transitions recorded yet.</p>
      ) : (
        <div className="relative flex flex-col gap-0">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-zinc-800" />
          {incidents.map((ev, i) => {
            const styles = INCIDENT_TYPE_STYLES[ev.status] ?? INCIDENT_TYPE_STYLES.unknown
            return (
              <div key={i} className="relative flex gap-4 pb-4 last:pb-0">
                <div className={cn("w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 z-10 border-2 border-zinc-950", styles.dot)} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-zinc-500">{fmtRelative(ev.checkedAt)}</span>
                    <span className="text-xs font-semibold text-zinc-300">{ev.serviceName}</span>
                    <span className={cn("text-[10px] font-bold uppercase tracking-wide", styles.text)}>
                      {styles.label}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">{ev.detail}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Grid layout

function GridLayout({ services }: { services: DashboardService[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {services.map((svc) => {
        const status = toStatus(svc.currentStatus)
        const Icon   = CHECK_TYPE_ICON[svc.checkType] ?? Globe
        return (
          <div key={svc.serviceName} className="relative overflow-hidden bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3 hover:border-zinc-700 transition-colors">
            <div className={cn("absolute w-[3px] inset-y-0 left-0", STATUS_LEFT_BAR[status])} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <span className="text-sm font-semibold text-zinc-200">{svc.serviceName}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-full", STATUS_DOT[status], status !== "operational" && "animate-pulse")} />
                <span className={cn("text-xs font-semibold", STATUS_TEXT_COLOR[status])}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
            </div>
            <Sparkline status={status} data={svc.timeseries} height={40} />
            <p className="text-[10px] text-zinc-600 -mt-1">Response time — last 24h</p>
            <div className="pt-2 border-t border-zinc-800">
              <UptimeBadges svc={svc} />
            </div>
            {svc.avgResponseMs !== null && (
              <p className="text-[11px] text-zinc-500">
                Avg response: <span className="text-zinc-300 font-mono">{svc.avgResponseMs}ms</span>
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// List layout

function ListLayout({ services }: { services: DashboardService[] }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
      {services.map((svc, i) => {
        const status = toStatus(svc.currentStatus)
        const Icon   = CHECK_TYPE_ICON[svc.checkType] ?? Globe
        const uptime = [
          { label: "24h", raw: svc.uptime24h },
          { label: "7d",  raw: svc.uptime7d  },
          { label: "30d", raw: svc.uptime30d },
        ]
        return (
          <div
            key={svc.serviceName}
            className={cn(
              "relative flex items-center gap-4 px-4 py-3 hover:bg-zinc-800/40 transition-colors overflow-hidden",
              i < services.length - 1 && "border-b border-zinc-800/60"
            )}
          >
            <div className={cn("absolute w-[3px] inset-y-0 left-0", STATUS_LEFT_BAR[status])} />
            <div className="flex items-center gap-2.5 w-36 shrink-0 pl-1">
              <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                <Icon className="w-3 h-3 text-zinc-400" />
              </div>
              <span className="text-xs font-semibold text-zinc-200 truncate">{svc.serviceName}</span>
            </div>
            <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded shrink-0", STATUS_BADGE[status])}>
              {STATUS_LABEL[status]}
            </span>
            <div className="flex-1 min-w-0">
              <Sparkline status={status} data={svc.timeseries} height={28} />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {uptime.map((u) => (
                <div key={u.label} className="text-center w-12">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider">{u.label}</p>
                  <p className={cn("text-[11px] font-bold leading-tight", {
                    "text-emerald-400": u.raw !== null && u.raw >= 99,
                    "text-amber-400":   u.raw !== null && u.raw >= 95 && u.raw < 99,
                    "text-red-400":     u.raw !== null && u.raw < 95,
                    "text-zinc-500":    u.raw === null,
                  })}>
                    {fmtUptime(u.raw)}
                  </p>
                </div>
              ))}
            </div>
            <div className="w-14 text-right shrink-0">
              <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Avg</p>
              <p className="text-[11px] font-mono text-zinc-400 leading-tight">
                {svc.avgResponseMs !== null ? `${svc.avgResponseMs}ms` : "—"}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Main component

export function SiteHealthSection() {
  const [layout,     setLayout]     = useState<LayoutMode>("grid")
  const [isExpanded, setIsExpanded] = useState(true)
  const { services, incidents, isLoading, error, refresh } = useDashboardHealth()

  const statuses        = services.map(s => toStatus(s.currentStatus))
  const operationalCount = statuses.filter(s => s === "operational").length
  const degradedCount    = statuses.filter(s => s === "degraded").length
  const downCount        = statuses.filter(s => s === "down").length

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-violet-400" />
            Site Health
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Service uptime, response times, and incident history.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {error ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : (
            <div className="flex items-center gap-1.5">
              {(degradedCount > 0 || downCount > 0) && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
              {!isLoading && (
                <span className="text-xs text-zinc-400">
                  {operationalCount} operational
                  {degradedCount > 0 && ` · ${degradedCount} degraded`}
                  {downCount > 0 && ` · ${downCount} down`}
                </span>
              )}
            </div>
          )}

          <button
            onClick={() => { void refresh() }}
            disabled={isLoading}
            title="Refresh"
            className="w-7 h-7 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
          </button>

          {isExpanded && (
            <div className="flex items-center gap-0.5 bg-zinc-800 rounded-md p-0.5">
              {LAYOUT_BUTTONS.map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setLayout(mode)}
                  title={label}
                  className={cn(
                    "w-7 h-7 flex items-center justify-center rounded transition-colors",
                    layout === mode ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setIsExpanded(v => !v)}
            title={isExpanded ? "Collapse" : "Expand"}
            className="w-7 h-7 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", !isExpanded && "-rotate-90")} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 flex flex-col gap-5">
          {isLoading ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
              <IncidentTimeline incidents={[]} isLoading />
            </>
          ) : (
            <>
              {layout === "grid" && <GridLayout services={services} />}
              {layout === "list" && <ListLayout services={services} />}
              <IncidentTimeline incidents={incidents} isLoading={false} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
