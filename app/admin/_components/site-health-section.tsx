"use client"

import { useState } from "react"
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Globe,
  Key,
  LayoutGrid,
  List,
  Mail,
  Maximize2,
  Shield,
  Zap,
} from "lucide-react"

import { cn } from "@/app/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type EndpointStatus = "operational" | "degraded" | "down" | "unknown"
type LayoutMode = "zoom" | "grid" | "list"

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

const SERVICE_CARDS: ServiceCard[] = [
  { name: "Supabase DB", icon: Database, status: "operational", uptime24h: "100%", uptime7d: "99.98%", uptime30d: "99.95%", avgResponseMs: 7 },
  { name: "Supabase Auth", icon: Shield, status: "operational", uptime24h: "100%", uptime7d: "99.99%", uptime30d: "99.97%", avgResponseMs: 48 },
  { name: "Edge Functions", icon: Zap, status: "degraded", uptime24h: "97.2%", uptime7d: "98.1%", uptime30d: "99.1%", avgResponseMs: 289 },
  { name: "Frontend", icon: Globe, status: "operational", uptime24h: "100%", uptime7d: "100%", uptime30d: "99.99%", avgResponseMs: 92 },
  { name: "Email (Resend)", icon: Mail, status: "operational", uptime24h: "100%", uptime7d: "99.9%", uptime30d: "99.8%", avgResponseMs: 138 },
  { name: "Stripe", icon: Key, status: "unknown", uptime24h: "—", uptime7d: "—", uptime30d: "—", avgResponseMs: null },
]

const INCIDENT_TIMELINE: IncidentEvent[] = [
  { time: "10:25 AM", service: "Edge Functions", type: "down", detail: "Connection timeout — function unreachable" },
  { time: "10:28 AM", service: "Edge Functions", type: "degraded", detail: "Service partially restored, high latency (298ms)" },
  { time: "10:33 AM", service: "Edge Functions", type: "degraded", detail: "Latency stabilising but still above threshold" },
  { time: "Yesterday 11:42 PM", service: "Supabase DB", type: "degraded", detail: "Slow query spike on roll_movements — resolved automatically" },
  { time: "Yesterday 11:50 PM", service: "Supabase DB", type: "recovered", detail: "Query performance returned to normal" },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<EndpointStatus, string> = {
  operational: "bg-emerald-400",
  degraded: "bg-amber-400",
  down: "bg-red-400",
  unknown: "bg-zinc-500",
}

const STATUS_LABEL: Record<EndpointStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
}

const STATUS_TEXT_COLOR: Record<EndpointStatus, string> = {
  operational: "text-emerald-400",
  degraded: "text-amber-400",
  down: "text-red-400",
  unknown: "text-zinc-500",
}

const STATUS_BADGE: Record<EndpointStatus, string> = {
  operational: "text-emerald-400 bg-emerald-900/40 border border-emerald-800",
  degraded: "text-amber-400 bg-amber-900/40 border border-amber-800",
  down: "text-red-400 bg-red-900/40 border border-red-800",
  unknown: "text-zinc-400 bg-zinc-800 border border-zinc-700",
}

const INCIDENT_STYLES: Record<IncidentEvent["type"], { dot: string; label: string; text: string }> = {
  down: { dot: "bg-red-400", label: "Down", text: "text-red-400" },
  degraded: { dot: "bg-amber-400", label: "Degraded", text: "text-amber-400" },
  recovered: { dot: "bg-emerald-400", label: "Recovered", text: "text-emerald-400" },
}

const SPARKLINE_COLORS: Record<EndpointStatus, { stroke: string; fill: string }> = {
  operational: { stroke: "#34d399", fill: "rgba(52,211,153,0.08)" },
  degraded: { stroke: "#fbbf24", fill: "rgba(251,191,36,0.08)" },
  down: { stroke: "#f87171", fill: "rgba(248,113,113,0.08)" },
  unknown: { stroke: "#52525b", fill: "rgba(82,82,91,0.08)" },
}

const LAYOUT_BUTTONS: { mode: LayoutMode; icon: React.ElementType; label: string }[] = [
  { mode: "zoom", icon: Maximize2, label: "Zoom" },
  { mode: "grid", icon: LayoutGrid, label: "Grid" },
  { mode: "list", icon: List, label: "List" },
]

const PREVIEW_COUNT = 3

// ─── Sparkline SVG ────────────────────────────────────────────────────────────

function Sparkline({ svc, height = 40 }: { svc: ServiceCard; height?: number }) {
  const W = 240
  const H = height
  const pts = Array.from({ length: 24 }, (_, i) => {
    const base = svc.status === "operational" ? 40 : svc.status === "degraded" ? 55 : 75
    const jitter = Math.sin(i * 1.3) * 12 + Math.cos(i * 0.7) * 8
    return Math.max(4, Math.min(H - 4, base + jitter))
  })
  const polyline = pts.map((y, i) => `${(i / (pts.length - 1)) * W},${y}`).join(" ")
  const fillPts = `0,${H} ${polyline} ${W},${H}`
  const { stroke, fill } = SPARKLINE_COLORS[svc.status]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded bg-zinc-900"
      style={{ height }}
      preserveAspectRatio="none"
    >
      <polygon points={fillPts} fill={fill} />
      <polyline
        points={polyline}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ─── Uptime badges ────────────────────────────────────────────────────────────

function UptimeBadges({ svc }: { svc: ServiceCard }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {[
        { label: "24h", value: svc.uptime24h },
        { label: "7d", value: svc.uptime7d },
        { label: "30d", value: svc.uptime30d },
      ].map((u) => (
        <div key={u.label} className="bg-zinc-900 rounded px-2 py-1.5 text-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{u.label}</p>
          <p
            className={cn("text-xs font-bold mt-0.5", {
              "text-emerald-400": parseFloat(u.value) >= 99,
              "text-amber-400": parseFloat(u.value) >= 95 && parseFloat(u.value) < 99,
              "text-red-400": parseFloat(u.value) < 95,
              "text-zinc-500": u.value === "—",
            })}
          >
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

// ─── Layout: Zoom (single card with navigation) ───────────────────────────────

function ZoomLayout({ cards }: { cards: ServiceCard[] }) {
  const [index, setIndex] = useState(0)
  const svc = cards[index]
  const Icon = svc.icon
  const total = cards.length

  return (
    <div className="flex flex-col gap-3">
      {/* Navigation row */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIndex((i) => (i - 1 + total) % total)}
          disabled={total <= 1}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Prev
        </button>

        {/* Dot indicators */}
        <div className="flex items-center gap-1.5">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={cn(
                "rounded-full transition-all duration-150",
                i === index
                  ? "w-4 h-2 bg-violet-500"
                  : "w-2 h-2 bg-zinc-700 hover:bg-zinc-500"
              )}
            />
          ))}
        </div>

        <button
          onClick={() => setIndex((i) => (i + 1) % total)}
          disabled={total <= 1}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded card */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-zinc-300" />
            </div>
            <div>
              <p className="text-base font-bold text-zinc-100">{svc.name}</p>
              {svc.avgResponseMs !== null && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  Avg response: <span className="font-mono text-zinc-400">{svc.avgResponseMs}ms</span>
                </p>
              )}
            </div>
          </div>
          <span className={cn("text-xs font-bold px-2.5 py-1 rounded-md border", STATUS_BADGE[svc.status])}>
            {STATUS_LABEL[svc.status]}
          </span>
        </div>

        {/* Large sparkline */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-500">Response time — last 24h</span>
            <span className={cn("text-[11px] font-semibold", STATUS_TEXT_COLOR[svc.status])}>
              {svc.avgResponseMs !== null ? `${svc.avgResponseMs}ms avg` : "No data"}
            </span>
          </div>
          <Sparkline svc={svc} height={80} />
        </div>

        {/* Uptime */}
        <div className="pt-1 border-t border-zinc-800">
          <p className="text-[11px] text-zinc-500 mb-2 uppercase tracking-wider">Uptime</p>
          <UptimeBadges svc={svc} />
        </div>
      </div>

      {/* Counter */}
      <p className="text-center text-xs text-zinc-600 tabular-nums">
        {index + 1} / {total}
      </p>
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
          <div key={svc.name} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3 hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <span className="text-sm font-semibold text-zinc-200">{svc.name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-full", STATUS_DOT[svc.status])} />
                <span className={cn("text-xs font-semibold", STATUS_TEXT_COLOR[svc.status])}>
                  {STATUS_LABEL[svc.status]}
                </span>
              </div>
            </div>
            <Sparkline svc={svc} height={40} />
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
              "flex items-center gap-4 px-4 py-3 hover:bg-zinc-800/40 transition-colors",
              i < cards.length - 1 && "border-b border-zinc-800/60"
            )}
          >
            {/* Icon + name */}
            <div className="flex items-center gap-2.5 w-36 shrink-0">
              <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                <Icon className="w-3 h-3 text-zinc-400" />
              </div>
              <span className="text-xs font-semibold text-zinc-200 truncate">{svc.name}</span>
            </div>

            {/* Status badge */}
            <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded shrink-0", STATUS_BADGE[svc.status])}>
              {STATUS_LABEL[svc.status]}
            </span>

            {/* Inline sparkline */}
            <div className="flex-1 min-w-0">
              <Sparkline svc={svc} height={28} />
            </div>

            {/* Uptime chips */}
            <div className="flex items-center gap-1.5 shrink-0">
              {[
                { label: "24h", value: svc.uptime24h },
                { label: "7d", value: svc.uptime7d },
                { label: "30d", value: svc.uptime30d },
              ].map((u) => (
                <div key={u.label} className="text-center w-12">
                  <p className="text-[9px] text-zinc-600 uppercase tracking-wider">{u.label}</p>
                  <p
                    className={cn("text-[11px] font-bold leading-tight", {
                      "text-emerald-400": parseFloat(u.value) >= 99,
                      "text-amber-400": parseFloat(u.value) >= 95 && parseFloat(u.value) < 99,
                      "text-red-400": parseFloat(u.value) < 95,
                      "text-zinc-500": u.value === "—",
                    })}
                  >
                    {u.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Avg response */}
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
  const [isExpanded, setIsExpanded] = useState(false)
  const [layout, setLayout] = useState<LayoutMode>("grid")

  const visibleCards = layout === "zoom" || isExpanded ? SERVICE_CARDS : SERVICE_CARDS.slice(0, PREVIEW_COUNT)

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
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs text-zinc-400">1 service degraded</span>
          </div>

          {/* Layout toggle buttons */}
          <div className="flex items-center gap-0.5 bg-zinc-800 rounded-md p-0.5">
            {LAYOUT_BUTTONS.map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setLayout(mode)}
                title={label}
                className={cn(
                  "w-7 h-7 flex items-center justify-center rounded transition-colors",
                  layout === mode
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-5">
        {layout === "zoom" && <ZoomLayout cards={SERVICE_CARDS} />}
        {layout === "grid" && <GridLayout cards={visibleCards} />}
        {layout === "list" && <ListLayout cards={visibleCards} />}

        {/* Expand / collapse — hidden in zoom mode (it handles all cards itself) */}
        {layout !== "zoom" && (
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-md text-xs font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 border border-zinc-800 hover:border-zinc-700 transition-colors"
          >
            <ChevronDown
              className={cn("w-4 h-4 transition-transform duration-200", isExpanded && "rotate-180")}
            />
            {isExpanded
              ? "Show less"
              : `Show ${SERVICE_CARDS.length - PREVIEW_COUNT} more services`}
          </button>
        )}

        {/* Incident timeline — visible when expanded or in zoom mode */}
        {(isExpanded || layout === "zoom") && <IncidentTimeline />}
      </div>
    </div>
  )
}
