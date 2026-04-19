"use client"

import { cn } from "@/app/lib/utils"
import { useDashboardHealth } from "@/app/admin/_hooks/use-dashboard-health"

type EndpointStatus = "operational" | "degraded" | "down" | "unknown"

const STATUS_BADGE: Record<EndpointStatus, string> = {
  operational: "text-emerald-400 bg-emerald-900/40",
  degraded:    "text-amber-400 bg-amber-900/40",
  down:        "text-red-400 bg-red-900/40",
  unknown:     "text-zinc-400 bg-zinc-800",
}

const STATUS_LABEL: Record<EndpointStatus, string> = {
  operational: "Operational",
  degraded:    "Degraded",
  down:        "Down",
  unknown:     "Unknown",
}

function toStatus(raw: string | null): EndpointStatus {
  if (raw === "operational") return "operational"
  if (raw === "degraded")    return "degraded"
  if (raw === "down")        return "down"
  return "unknown"
}

export function SystemStatusSection() {
  const { services, isLoading } = useDashboardHealth()

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-200">System Status</h2>
      {isLoading ? (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-center justify-between py-1 border-b border-zinc-800/60 last:border-0 animate-pulse">
              <div className="h-3 w-28 bg-zinc-800 rounded" />
              <div className="h-5 w-20 bg-zinc-800 rounded" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2">
          {services.map((svc) => {
            const status = toStatus(svc.currentStatus)
            return (
              <li
                key={svc.serviceName}
                className="flex items-center justify-between py-1 border-b border-zinc-800/60 last:border-0"
              >
                <span className="text-sm text-zinc-300">{svc.serviceName}</span>
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded", STATUS_BADGE[status])}>
                  {STATUS_LABEL[status]}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
