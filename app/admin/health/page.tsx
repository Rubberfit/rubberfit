"use client"

import { useState } from "react"
import { Activity, Clock, Globe } from "lucide-react"

import { cn } from "@/app/lib/utils"
import { OverviewPanel } from "./_components/overview-panel"
import { HealthEndPoint } from "./_components/health-endpoint-panel"
import { PeriodicPanel } from "./_components/periodic-panel"
import { useHealthStatus } from "./_hooks/use-health-status"
import { useAlerts } from "./_hooks/use-alerts"
import { usePeriodicChecks } from "./_hooks/use-periodic-checks"
import type { HealthAlert } from "./_hooks/use-alerts"

// Types

type TabId = "overview" | "endpoints" | "periodic"

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

function LivePeriodicPanel() {
  const { checks, uptime, isLoading, error, refresh } = usePeriodicChecks()
  return (
    <PeriodicPanel
      checks={checks}
      uptime={uptime}
      isLoading={isLoading}
      error={error}
      onRefresh={() => { void refresh() }}
    />
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
        {activeTab === "periodic"  && <LivePeriodicPanel />}
      </div>
    </div>
  )
}
