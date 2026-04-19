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
import { OverviewPanel } from "./_components/overview-panel"
import { HealthEndPoint } from "./_components/health-endpoint-panel"
import { useHealthStatus } from "./_hooks/use-health-status"
import { useAlerts } from "./_hooks/use-alerts"
import type { HealthAlert } from "./_hooks/use-alerts"

// Types

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

// Endpoints data

const ENDPOINTS: Endpoint[] = [
  { id: "supabase-db",    service: "Supabase DB",    description: "SELECT 1 ping via REST",           method: "SQL",                    icon: Database, status: "operational", lastChecked: "2m ago", responseTime: "6ms"   },
  { id: "supabase-auth",  service: "Supabase Auth",  description: "Token validation endpoint",         method: "POST /auth/v1/token",    icon: Shield,   status: "operational", lastChecked: "2m ago", responseTime: "42ms"  },
  { id: "edge-functions", service: "Edge Functions", description: "Invoke health check function",      method: "POST /functions/v1/health", icon: Zap,   status: "degraded",    lastChecked: "2m ago", responseTime: "310ms" },
  { id: "frontend",       service: "Frontend",       description: "HTTP 200 on deployed URL",          method: "GET /",                  icon: Globe,    status: "operational", lastChecked: "2m ago", responseTime: "88ms"  },
  { id: "email-resend",   service: "Email (Resend)", description: "API key validation check",          method: "GET /v1/domains",        icon: Mail,     status: "operational", lastChecked: "2m ago", responseTime: "134ms" },
  { id: "stripe",         service: "Stripe",         description: "API connectivity check",            method: "GET /v1/balance",        icon: Key,      status: "unknown",     lastChecked: "Never",  responseTime: null    },
]

// Periodic data

const HEALTH_CHECKS: HealthCheck[] = [
  { timestamp: "10:35 AM", service: "Supabase DB",    status: "operational", responseMs: 6,    detail: "OK" },
  { timestamp: "10:35 AM", service: "Supabase Auth",  status: "operational", responseMs: 44,   detail: "OK" },
  { timestamp: "10:35 AM", service: "Edge Functions", status: "degraded",    responseMs: 312,  detail: "Latency >300ms threshold" },
  { timestamp: "10:35 AM", service: "Frontend",       status: "operational", responseMs: 91,   detail: "HTTP 200" },
  { timestamp: "10:35 AM", service: "Email (Resend)", status: "operational", responseMs: 140,  detail: "API key valid" },
  { timestamp: "10:30 AM", service: "Supabase DB",    status: "operational", responseMs: 5,    detail: "OK" },
  { timestamp: "10:30 AM", service: "Edge Functions", status: "degraded",    responseMs: 298,  detail: "Latency >300ms threshold" },
  { timestamp: "10:25 AM", service: "Edge Functions", status: "down",        responseMs: null, detail: "Connection timeout after 5000ms" },
]

// Style maps 

const ENDPOINT_BAR_COLOR: Record<EndpointStatus, string> = {
  operational: "bg-emerald-500",
  degraded:    "bg-amber-500",
  down:        "bg-red-500",
  unknown:     "bg-zinc-600",
}

const ENDPOINT_STATUS_BADGE: Record<EndpointStatus, string> = {
  operational: "text-emerald-400 bg-emerald-900/40 border border-emerald-800",
  degraded:    "text-amber-400 bg-amber-900/40 border border-amber-800",
  down:        "text-red-400 bg-red-900/40 border border-red-800",
  unknown:     "text-zinc-400 bg-zinc-800 border border-zinc-700",
}

const ENDPOINT_STATUS_LABEL: Record<EndpointStatus, string> = {
  operational: "Operational",
  degraded:    "Degraded",
  down:        "Down",
  unknown:     "Unknown",
}

const ENDPOINT_STATUS_ICON: Record<EndpointStatus, React.ElementType> = {
  operational: CheckCircle2,
  degraded:    AlertTriangle,
  down:        XCircle,
  unknown:     Circle,
}

// Tabs config

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview",  label: "Overview",        icon: Activity },
  { id: "endpoints", label: "Health Endpoints", icon: Globe    },
  { id: "periodic",  label: "Periodic Checks",  icon: Clock    },
]

// Alert severity/status style maps 

const ALERT_SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high:     "bg-red-400",
  medium:   "bg-amber-400",
  low:      "bg-sky-400",
}

const ALERT_SEVERITY_TEXT: Record<string, string> = {
  critical: "text-red-400",
  high:     "text-red-400",
  medium:   "text-amber-400",
  low:      "text-sky-400",
}

// Live overview tab (uses hooks for real data)

function LiveOverviewTab() {
  const { services, incidents, isLoading, isRunning, lastChecked, error, runChecks } =
    useHealthStatus()
  const { alerts, acknowledge, resolve } = useAlerts()

  return (
    <div className="flex flex-col gap-6">
      <OverviewPanel
        services={services}
        incidents={incidents}
        isLoading={isLoading}
        isRunning={isRunning}
        lastChecked={lastChecked}
        error={error}
        onRunChecks={() => { void runChecks() }}
      />

      {/* Active alerts management */}
      {alerts.length > 0 && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-200">
              Active Alerts
              <span className="ml-2 text-[10px] font-normal text-zinc-500">{alerts.length} open</span>
            </h2>
          </div>
          <div className="flex flex-col divide-y divide-zinc-800/60">
            {alerts.map((alert: HealthAlert) => (
              <div key={alert.id} className="flex items-center gap-4 px-4 py-3">
                <span className={cn("w-2 h-2 rounded-full shrink-0", ALERT_SEVERITY_DOT[alert.severity])} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-xs font-semibold text-zinc-200">{alert.title}</span>
                    <span className={cn("text-[10px] font-bold uppercase tracking-wide", ALERT_SEVERITY_TEXT[alert.severity])}>
                      {alert.severity}
                    </span>
                  </div>
                  {alert.service_name && (
                    <p className="text-[11px] text-zinc-500 mt-0.5">{alert.service_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {alert.status === "active" && (
                    <button
                      onClick={() => { void acknowledge(alert.id) }}
                      className="text-xs font-medium px-2 py-1 rounded-md border border-amber-800/60 text-amber-400 hover:bg-amber-900/20 transition-colors"
                    >
                      Acknowledge
                    </button>
                  )}
                  {alert.status === "investigating" && (
                    <button
                      onClick={() => { void resolve(alert.id) }}
                      className="text-xs font-medium px-2 py-1 rounded-md border border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/20 transition-colors"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Tab panels



function PeriodicPanel() {
  return (
    <div className="flex flex-col gap-5">
      {/* Schedule tiers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { tier: "Critical", services: "DB · Auth · Frontend",   interval: "Every 5 min",  borderClass: "border-red-900/60",   labelColor: "text-red-400"   },
          { tier: "Standard", services: "Edge Fn · Email · Stripe", interval: "Every 15 min", borderClass: "border-amber-900/50", labelColor: "text-amber-400" },
          { tier: "Extended", services: "All services",            interval: "Every 30 min", borderClass: "border-sky-900/50",   labelColor: "text-sky-400"   },
        ].map((tier) => (
          <div
            key={tier.tier}
            className={cn("bg-zinc-950 border rounded-lg p-4 flex flex-col gap-2", tier.borderClass)}
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
            { period: "7d",  value: "98.9%", label: "Last 7 days"   },
            { period: "30d", value: "99.2%", label: "Last 30 days"  },
          ].map((stat) => (
            <div key={stat.period} className="px-4 first:pl-0 last:pr-0 flex flex-col gap-0.5">
              <p className="text-[11px] text-zinc-500">{stat.label}</p>
              <p className="text-2xl font-bold text-zinc-100 tabular-nums">{stat.value}</p>
              <div className="h-1 bg-zinc-800 rounded-full mt-1.5">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: stat.value }} />
              </div>
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

// Page

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
        {activeTab === "overview"  && <LiveOverviewTab />}
        {activeTab === "endpoints" && <HealthEndPoint />}
        {activeTab === "periodic"  && <PeriodicPanel  />}
      </div>
    </div>
  )
}
