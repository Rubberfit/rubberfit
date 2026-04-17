"use client"

import { useState } from "react"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Database,
  Globe,
  Key,
  Mail,
  RefreshCw,
  Settings,
  Shield,
  XCircle,
  Zap,
} from "lucide-react"

import { cn } from "@/app/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = "overview" | "endpoints" | "periodic"
type EndpointStatus = "operational" | "degraded" | "down" | "unknown"

interface Endpoint {
  id: string
  service: string
  description: string
  method: string
  icon: React.ElementType
  status: EndpointStatus
  lastChecked: string
  responseTime: string | null
}

interface HealthCheck {
  timestamp: string
  service: string
  status: EndpointStatus
  responseMs: number | null
  detail: string
}

// ─── Overview data ────────────────────────────────────────────────────────────

const SERVICES = [
  { name: "API Gateway", env: "Production", status: "HEALTHY" as const, uptime: "99.98%", latency: "42ms", lastIncident: "12 days ago" },
  { name: "Database Primary", env: "Production", status: "HEALTHY" as const, uptime: "99.99%", latency: "6ms", lastIncident: "34 days ago" },
  { name: "Job Queue", env: "Production", status: "DEGRADED" as const, uptime: "98.2%", latency: "320ms", lastIncident: "2 hours ago" },
  { name: "File Storage", env: "Production", status: "HEALTHY" as const, uptime: "100%", latency: "18ms", lastIncident: "Never" },
  { name: "Auth Service", env: "Production", status: "HEALTHY" as const, uptime: "99.95%", latency: "55ms", lastIncident: "7 days ago" },
  { name: "Email Service", env: "Staging", status: "DOWN" as const, uptime: "91.3%", latency: "—", lastIncident: "1 hour ago" },
]

const INCIDENTS = [
  { time: "09:14", service: "Job Queue", severity: "Medium", description: "Processing lag >300ms on cut-job worker", status: "Investigating" },
  { time: "08:02", service: "Email Service", severity: "High", description: "SMTP relay unreachable in staging env", status: "Active" },
  { time: "Yesterday 22:41", service: "API Gateway", severity: "Low", description: "Elevated 429 rate from org NexThread", status: "Resolved" },
  { time: "Yesterday 15:09", service: "Database Primary", severity: "Low", description: "Slow query detected on roll_movements", status: "Resolved" },
]

// ─── Endpoints data ───────────────────────────────────────────────────────────

const ENDPOINTS: Endpoint[] = [
  { id: "supabase-db", service: "Supabase DB", description: "SELECT 1 ping via REST", method: "SQL", icon: Database, status: "operational", lastChecked: "2m ago", responseTime: "6ms" },
  { id: "supabase-auth", service: "Supabase Auth", description: "Token validation endpoint", method: "POST /auth/v1/token", icon: Shield, status: "operational", lastChecked: "2m ago", responseTime: "42ms" },
  { id: "edge-functions", service: "Edge Functions", description: "Invoke health check function", method: "POST /functions/v1/health", icon: Zap, status: "degraded", lastChecked: "2m ago", responseTime: "310ms" },
  { id: "frontend", service: "Frontend", description: "HTTP 200 on deployed URL", method: "GET /", icon: Globe, status: "operational", lastChecked: "2m ago", responseTime: "88ms" },
  { id: "email-resend", service: "Email (Resend)", description: "API key validation check", method: "GET /v1/domains", icon: Mail, status: "operational", lastChecked: "2m ago", responseTime: "134ms" },
  { id: "stripe", service: "Stripe", description: "API connectivity check", method: "GET /v1/balance", icon: Key, status: "unknown", lastChecked: "Never", responseTime: null },
]

// ─── Periodic data ────────────────────────────────────────────────────────────

const HEALTH_CHECKS: HealthCheck[] = [
  { timestamp: "10:35 AM", service: "Supabase DB", status: "operational", responseMs: 6, detail: "OK" },
  { timestamp: "10:35 AM", service: "Supabase Auth", status: "operational", responseMs: 44, detail: "OK" },
  { timestamp: "10:35 AM", service: "Edge Functions", status: "degraded", responseMs: 312, detail: "Latency >300ms threshold" },
  { timestamp: "10:35 AM", service: "Frontend", status: "operational", responseMs: 91, detail: "HTTP 200" },
  { timestamp: "10:35 AM", service: "Email (Resend)", status: "operational", responseMs: 140, detail: "API key valid" },
  { timestamp: "10:30 AM", service: "Supabase DB", status: "operational", responseMs: 5, detail: "OK" },
  { timestamp: "10:30 AM", service: "Edge Functions", status: "degraded", responseMs: 298, detail: "Latency >300ms threshold" },
  { timestamp: "10:25 AM", service: "Edge Functions", status: "down", responseMs: null, detail: "Connection timeout after 5000ms" },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OVERVIEW_STATUS_STYLES = {
  HEALTHY: "text-emerald-400 bg-emerald-900/40 border border-emerald-800",
  DEGRADED: "text-amber-400 bg-amber-900/40 border border-amber-800",
  DOWN: "text-red-400 bg-red-900/40 border border-red-800",
} as const

const SEVERITY_STYLES: Record<string, string> = {
  High: "text-red-400 bg-red-900/40",
  Medium: "text-amber-400 bg-amber-900/40",
  Low: "text-sky-400 bg-sky-900/40",
}

const INCIDENT_STATUS_STYLES: Record<string, string> = {
  Active: "text-red-400",
  Investigating: "text-amber-400",
  Resolved: "text-zinc-500",
}

const ENV_STYLES: Record<string, string> = {
  Production: "text-emerald-300 bg-emerald-900/40",
  Staging: "text-sky-300 bg-sky-900/40",
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

// ─── Tabs config ─────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "endpoints", label: "Health Endpoints", icon: Globe },
  { id: "periodic", label: "Periodic Checks", icon: Clock },
]

// ─── Tab panels ───────────────────────────────────────────────────────────────

function OverviewPanel() {
  return (
    <div className="flex flex-col gap-6">
      {/* Service grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {SERVICES.map((svc) => (
          <div key={svc.name} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-200">{svc.name}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ENV_STYLES[svc.env] ?? ""}`}>
                {svc.env}
              </span>
            </div>
            <span className={`self-start text-xs font-bold px-2.5 py-1 rounded ${OVERVIEW_STATUS_STYLES[svc.status]}`}>
              {svc.status}
            </span>
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
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Last Incident</p>
                <p className="text-sm font-semibold text-zinc-200 mt-0.5">{svc.lastIncident}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Incident log */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Incident Log</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                {["Time", "Service", "Severity", "Description", "Status"].map((col) => (
                  <th key={col} className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {INCIDENTS.map((inc, i) => (
                <tr key={i} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-zinc-400 font-mono whitespace-nowrap">{inc.time}</td>
                  <td className="px-4 py-3 text-zinc-300">{inc.service}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${SEVERITY_STYLES[inc.severity] ?? ""}`}>
                      {inc.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{inc.description}</td>
                  <td className={`px-4 py-3 text-xs font-semibold ${INCIDENT_STATUS_STYLES[inc.status] ?? ""}`}>
                    {inc.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function EndpointsPanel() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          6 configurable endpoints. Click the gear icon to edit connection details.
        </p>
        <button className="flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 bg-violet-900/30 hover:bg-violet-900/50 border border-violet-800/60 px-3 py-1.5 rounded-md transition-colors">
          <RefreshCw className="w-3 h-3" />
          Run All Checks
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {ENDPOINTS.map((ep) => {
          const Icon = ep.icon
          const StatusIcon = ENDPOINT_STATUS_ICON[ep.status]
          return (
            <div key={ep.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3 hover:border-zinc-700 transition-colors">
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-200 leading-tight">{ep.service}</p>
                    <p className="text-[11px] text-zinc-500 font-mono mt-0.5">{ep.method}</p>
                  </div>
                </div>
                <button className="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0">
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Description */}
              <p className="text-xs text-zinc-500 leading-snug">{ep.description}</p>

              {/* Status row */}
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
    </div>
  )
}

function PeriodicPanel() {
  return (
    <div className="flex flex-col gap-5">
      {/* Schedule tiers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { tier: "Critical", services: "DB · Auth · Frontend", interval: "Every 5 min", borderColor: "rgb(127 29 29 / 0.6)", labelColor: "text-red-400" },
          { tier: "Standard", services: "Edge Fn · Email · Stripe", interval: "Every 15 min", borderColor: "rgb(120 53 15 / 0.5)", labelColor: "text-amber-400" },
          { tier: "Extended", services: "All services", interval: "Every 30 min", borderColor: "rgb(12 74 110 / 0.5)", labelColor: "text-sky-400" },
        ].map((tier) => (
          <div
            key={tier.tier}
            className="bg-zinc-950 border rounded-lg p-4 flex flex-col gap-2"
            style={{ borderColor: tier.borderColor }}
          >
            <div className="flex items-center justify-between">
              <span className={cn("text-xs font-bold uppercase tracking-wider", tier.labelColor)}>
                {tier.tier}
              </span>
              <button className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
                <Settings className="w-3 h-3" /> Edit
              </button>
            </div>
            <p className="text-sm font-semibold text-zinc-200">{tier.interval}</p>
            <p className="text-[11px] text-zinc-500">{tier.services}</p>
          </div>
        ))}
      </div>

      {/* Uptime summary */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Uptime Summary — <span className="text-zinc-400">admin.health_checks</span>
        </p>
        <div className="grid grid-cols-3 divide-x divide-zinc-800">
          {[
            { period: "24h", value: "99.4%", label: "Last 24 hours" },
            { period: "7d", value: "98.9%", label: "Last 7 days" },
            { period: "30d", value: "99.2%", label: "Last 30 days" },
          ].map((stat) => (
            <div key={stat.period} className="px-4 first:pl-0 last:pr-0 flex flex-col gap-0.5">
              <p className="text-[11px] text-zinc-500">{stat.label}</p>
              <p className="text-2xl font-bold text-zinc-100 tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent check results */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-300">Recent Check Results</p>
          <span className="text-[10px] text-zinc-500 font-mono">admin.health_checks</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                {["Timestamp", "Service", "Status", "Response Time", "Detail"].map((col) => (
                  <th key={col} className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HEALTH_CHECKS.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-zinc-500 whitespace-nowrap">{row.timestamp}</td>
                  <td className="px-4 py-2.5 text-zinc-300 text-xs">{row.service}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded", ENDPOINT_STATUS_BADGE[row.status])}>
                      {ENDPOINT_STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">
                    {row.responseMs !== null ? `${row.responseMs}ms` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-zinc-500">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HealthPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview")

  return (
    <div className="flex flex-col gap-0">
      {/* Page header + tabs */}
      <div className="px-6 pt-6 pb-0 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Service Health</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Monitor services, configure endpoints, and manage check schedules.</p>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Last checked: <span className="text-zinc-400">Today at 10:31 AM</span></p>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-zinc-800">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors",
                  isActive
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === "overview" && <OverviewPanel />}
        {activeTab === "endpoints" && <EndpointsPanel />}
        {activeTab === "periodic" && <PeriodicPanel />}
      </div>
    </div>
  )
}
