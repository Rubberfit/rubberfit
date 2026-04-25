"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, LayoutGrid } from "lucide-react"

import { useAuth } from "@/app/contexts/AuthContext"

const BREADCRUMB_MAP: Record<string, string[]> = {
  "/admin": ["Admin", "Dashboard"],
  "/admin/health": ["Admin", "Health"],
  "/admin/analytics": ["Admin", "Analytics"],
  "/admin/deployments": ["Admin", "Deployments"],
  "/admin/orgs": ["Admin", "Organizations"],
}

function getBreadcrumb(pathname: string): string[] {
  if (BREADCRUMB_MAP[pathname]) return BREADCRUMB_MAP[pathname]
  if (pathname.startsWith("/admin/orgs/")) return ["Admin", "Organizations", "Org Detail"]
  return ["Admin"]
}

function getInitials(email: string): string {
  const local = email.split("@")[0]
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

type AlertSeverity = "low" | "medium" | "high" | "critical"
type AlertStatus = "active" | "investigating"

interface Alert {
  id: string
  service_name: string | null
  severity: AlertSeverity
  title: string
  message: string | null
  status: AlertStatus
  triggered_at: string
}

interface AlertsApiResponse {
  alerts: Alert[]
  fetchedAt: string
}

const SEVERITY_COLORS: Record<AlertSeverity, { dot: string; label: string; row: string }> = {
  critical: {
    dot: "bg-red-500",
    label: "text-red-400 bg-red-900/40 border border-red-800",
    row: "border-l-2 border-red-600",
  },
  high: {
    dot: "bg-orange-500",
    label: "text-orange-400 bg-orange-900/40 border border-orange-800",
    row: "border-l-2 border-orange-500",
  },
  medium: {
    dot: "bg-amber-400",
    label: "text-amber-400 bg-amber-900/40 border border-amber-800",
    row: "border-l-2 border-amber-500",
  },
  low: {
    dot: "bg-zinc-400",
    label: "text-zinc-400 bg-zinc-800 border border-zinc-700",
    row: "border-l-2 border-zinc-600",
  },
}

function fmtRelativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

export function AdminTopbar() {
  const pathname = usePathname()
  const crumbs = getBreadcrumb(pathname)
  const { user } = useAuth()

  const email = user?.email ?? ""
  const displayName = user?.name ?? ""
  const initials = email ? getInitials(email) : "IO"

  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)

  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/alerts")
      if (!res.ok) return
      const body = (await res.json()) as AlertsApiResponse
      setAlerts(body.alerts)
      setFetchedAt(body.fetchedAt)
    } catch (_error) {
      // badge stays at 0 if fetch fails
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 60_000)
    return () => clearInterval(interval)
  }, [fetchAlerts])

  useEffect(() => {
    if (!notifOpen) return
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [notifOpen])

  useEffect(() => {
    if (!profileOpen) return
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [profileOpen])

  return (
    <header className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center px-6 justify-between shrink-0">
      <nav className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={crumb} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-zinc-600">/</span>}
            <span className={i === crumbs.length - 1 ? "text-zinc-100" : "text-zinc-500"}>{crumb}</span>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <span className="text-[11px] font-semibold bg-emerald-900/60 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">
          PRODUCTION
        </span>

        {/* Notifications bell */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => { setProfileOpen(false); setNotifOpen((prev) => !prev) }}
            className="relative w-8 h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4 text-zinc-400" />
            {alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white leading-none">
                {alerts.length > 9 ? "9+" : alerts.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-10 w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <span className="text-sm font-semibold text-zinc-100">Notifications</span>
                {loading ? (
                  <span className="text-[11px] text-zinc-500">Refreshing...</span>
                ) : (
                  fetchedAt && (
                    <span className="text-[11px] text-zinc-500">Updated {fmtRelativeTime(fetchedAt)}</span>
                  )
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-zinc-500">No notifications</div>
                ) : (
                  alerts.map((alert) => {
                    const colors = SEVERITY_COLORS[alert.severity]
                    return (
                      <div
                        key={alert.id}
                        className={`px-4 py-3 border-b border-zinc-800 last:border-b-0 ${colors.row}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`shrink-0 w-2 h-2 rounded-full ${colors.dot}`} />
                            <span className="text-sm text-zinc-100 font-medium truncate">{alert.title}</span>
                          </div>
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${colors.label}`}>
                            {alert.severity}
                          </span>
                        </div>
                        {alert.message && (
                          <p className="mt-1 text-xs text-zinc-400 line-clamp-2 pl-4">{alert.message}</p>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 pl-4">
                          {alert.service_name && (
                            <span className="text-[11px] text-zinc-500">{alert.service_name}</span>
                          )}
                          {alert.service_name && <span className="text-[11px] text-zinc-700">·</span>}
                          <span className="text-[11px] text-zinc-500">{fmtRelativeTime(alert.triggered_at)}</span>
                          {alert.status === "investigating" && (
                            <>
                              <span className="text-[11px] text-zinc-700">·</span>
                              <span className="text-[11px] text-amber-400">Investigating</span>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile avatar */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => { setNotifOpen(false); setProfileOpen((prev) => !prev) }}
            className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white hover:ring-2 hover:ring-violet-400 transition-all"
            aria-label="Profile menu"
          >
            {initials}
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-9 w-60 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
              {/* Identity */}
              <div className="px-4 py-3 border-b border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    {displayName && (
                      <p className="text-xs font-semibold text-zinc-100 truncate">{displayName}</p>
                    )}
                    <p className="text-[10px] text-zinc-400 truncate">{email}</p>
                  </div>
                </div>
              </div>

              {/* Notifications shortcut */}
              <button
                onClick={() => { setProfileOpen(false); setNotifOpen(true) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <Bell className="w-4 h-4 text-zinc-400 shrink-0" />
                <span className="flex-1 text-left">Notifications</span>
                {alerts.length > 0 && (
                  <span className="text-[10px] font-semibold bg-red-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                    {alerts.length > 9 ? "9+" : alerts.length}
                  </span>
                )}
              </button>

              {/* Dashboard link */}
              <Link
                href="/dashboard"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <LayoutGrid className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Dashboard Panel</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
