"use client"

import { useState } from "react"
import { Activity, ChevronDown, LayoutGrid, List } from "lucide-react"

import { cn } from "@/app/lib/utils"
import { Sparkline } from "@/app/admin/_components/sparkline"

// ─── Types ────────────────────────────────────────────────────────────────────

type EndpointStatus = "operational" | "degraded" | "down" | "unknown"
type LayoutMode = "grid" | "list"

interface ServiceCard {
  name: string
  icon: React.ElementType
  status: EndpointStatus
  uptime24h: string
  uptime7d: string
  uptime30d: string
  avgResponseMs: number | null
}

interface IncidentEvent {
  time: string
  service: string
  type: "down" | "degraded" | "recovered"
  detail: string
}

// ─── Static data ─────────────────────────────────────────────────────────────

import { Database, Globe, Key, Mail, Shield, Zap } from "lucide-react"

const SERVICE_CARDS: ServiceCard[] = [
  { name: "Supabase DB",    icon: Database, status: "operational", uptime24h: "100%",  uptime7d: "99.98%", uptime30d: "99.95%", avgResponseMs: 7   },
  { name: "Supabase Auth",  icon: Shield,   status: "operational", uptime24h: "100%",  uptime7d: "99.99%", uptime30d: "99.97%", avgResponseMs: 48  },
  { name: "Edge Functions", icon: Zap,      status: "degraded",    uptime24h: "97.2%", uptime7d: "98.1%",  uptime30d: "99.1%",  avgResponseMs: 289 },
  { name: "Frontend",       icon: Globe,    status: "operational", uptime24h: "100%",  uptime7d: "100%",   uptime30d: "99.99%", avgResponseMs: 92  },
  { name: "Email (Resend)", icon: Mail,     status: "operational", uptime24h: "100%",  uptime7d: "99.9%",  uptime30d: "99.8%",  avgResponseMs: 138 },
  { name: "Stripe",         icon: Key,      status: "unknown",     uptime24h: "—",     uptime7d: "—",      uptime30d: "—",      avgResponseMs: null },
]

const INCIDENT_TIMELINE: IncidentEvent[] = [
  { time: "10:25 AM",            service: "Edge Functions", type: "down",      detail: "Connection timeout — function unreachable" },
  { time: "10:28 AM",            service: "Edge Functions", type: "degraded",  detail: "Service partially restored, high latency (298ms)" },
  { time: "10:33 AM",            service: "Edge Functions", type: "degraded",  detail: "Latency stabilising but still above threshold" },
  { time: "Yesterday 11:42 PM",  service: "Supabase DB",   type: "degraded",  detail: "Slow query spike on roll_movements — resolved automatically" },
  { time: "Yesterday 11:50 PM",  service: "Supabase DB",   type: "recovered", detail: "Query performance returned to normal" },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const INCIDENT_STYLES: Record<IncidentEvent["type"], { dot: string; label: string; text: string }> = {
  down:      { dot: "bg-red-400",     label: "Down",      text: "text-red-400"     },
  degraded:  { dot: "bg-amber-400",   label: "Degraded",  text: "text-amber-400"   },
  recovered: { dot: "bg-emerald-400", label: "Recovered", text: "text-emerald-400" },
}

const LAYOUT_BUTTONS: { mode: LayoutMode; icon: React.ElementType; label: string }[] = [
  { mode: "grid", icon: LayoutGrid, label: "Grid" },
  { mode: "list", icon: List,       label: "List" },
]

// ─── Uptime badges ────────────────────────────────────────────────────────────

function UptimeBadges({ svc }: { svc: ServiceCard }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {[
        { label: "24h", value: svc.uptime24h },
        { label: "7d",  value: svc.uptime7d  },
        { label: "30d", value: svc.uptime30d },
      ].map((u) => (
        <div key={u.label} className="bg-zinc-900 rounded px-2 py-1.5 text-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{u.label}</p>
          <p className={cn("text-xs font-bold mt-0.5", {
            "text-emerald-400": parseFloat(u.value) >= 99,
            "text-amber-400":   parseFloat(u.value) >= 95 && parseFloat(u.value) < 99,
            "text-red-400":     parseFloat(u.value) < 95,
            "text-zinc-500":    u.value === "—",
          })}>
            {u.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Incident timeline ────────────────────────────────────────────────────────

function IncidentTimeline() {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-zinc-200">Incident Timeline</h3>
      <div className="relative flex flex-col gap-0">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-zinc-800" />
        {INCIDENT_TIMELINE.map((ev, i) => {
          const styles = INCIDENT_STYLES[ev.type]
          return (
            <div key={i} className="relative flex gap-4 pb-4 last:pb-0">
              <div className={cn("w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 z-10 border-2 border-zinc-950", styles.dot)} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono text-zinc-500">{ev.time}</span>
                  <span className="text-xs font-semibold text-zinc-300">{ev.service}</span>
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
    </div>
  )
}

// ─── Layout: Grid ─────────────────────────────────────────────────────────────

function GridLayout({ cards }: { cards: ServiceCard[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {cards.map((svc) => {
        const Icon = svc.icon
        return (
          <div key={svc.name} className="relative overflow-hidden bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3 hover:border-zinc-700 transition-colors">
            <div className={cn("absolute w-[3px] inset-y-0 left-0", STATUS_LEFT_BAR[svc.status])} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <span className="text-sm font-semibold text-zinc-200">{svc.name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-full", STATUS_DOT[svc.status], svc.status !== "operational" && "animate-pulse")} />
                <span className={cn("text-xs font-semibold", STATUS_TEXT_COLOR[svc.status])}>
                  {STATUS_LABEL[svc.status]}
                </span>
              </div>
            </div>
            <Sparkline status={svc.status} avgResponseMs={svc.avgResponseMs} height={40} />
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

// ─── Layout: List (compact rows) ─────────────────────────────────────────────

function ListLayout({ cards }: { cards: ServiceCard[] }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
      {cards.map((svc, i) => {
        const Icon = svc.icon
        return (
          <div
            key={svc.name}
            className={cn(
              "relative flex items-center gap-4 px-4 py-3 hover:bg-zinc-800/40 transition-colors overflow-hidden",
              i < cards.length - 1 && "border-b border-zinc-800/60"
            )}
          >
            <div className={cn("absolute w-[3px] inset-y-0 left-0", STATUS_LEFT_BAR[svc.status])} />
            <div className="flex items-center gap-2.5 w-36 shrink-0 pl-1">
              <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                <Icon className="w-3 h-3 text-zinc-400" />
              </div>
              <span className="text-xs font-semibold text-zinc-200 truncate">{svc.name}</span>
            </div>
            <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded shrink-0", STATUS_BADGE[svc.status])}>
              {STATUS_LABEL[svc.status]}
            </span>
            <div className="flex-1 min-w-0">
              <Sparkline status={svc.status} avgResponseMs={svc.avgResponseMs} height={28} />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {[
                { label: "24h", value: svc.uptime24h },
                { label: "7d",  value: svc.uptime7d  },
                { label: "30d", value: svc.uptime30d },
              ].map((u) => (
                <div key={u.label} className="text-center w-12">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider">{u.label}</p>
                  <p className={cn("text-[11px] font-bold leading-tight", {
                    "text-emerald-400": parseFloat(u.value) >= 99,
                    "text-amber-400":   parseFloat(u.value) >= 95 && parseFloat(u.value) < 99,
                    "text-red-400":     parseFloat(u.value) < 95,
                    "text-zinc-500":    u.value === "—",
                  })}>
                    {u.value}
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

// ─── Main component ───────────────────────────────────────────────────────────

export function SiteHealthSection() {
  const [layout, setLayout] = useState<LayoutMode>("grid")
  const [isExpanded, setIsExpanded] = useState(true)

  const operationalCount = SERVICE_CARDS.filter(c => c.status === "operational").length
  const degradedCount    = SERVICE_CARDS.filter(c => c.status === "degraded").length
  const downCount        = SERVICE_CARDS.filter(c => c.status === "down").length

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
          <div className="flex items-center gap-1.5">
            {(degradedCount > 0 || downCount > 0) && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
            <span className="text-xs text-zinc-400">
              {operationalCount} operational
              {degradedCount > 0 && ` · ${degradedCount} degraded`}
              {downCount > 0 && ` · ${downCount} down`}
            </span>
          </div>

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
          {layout === "grid" && <GridLayout cards={SERVICE_CARDS} />}
          {layout === "list" && <ListLayout cards={SERVICE_CARDS} />}
          <IncidentTimeline />
        </div>
      )}
    </div>
  )
}
