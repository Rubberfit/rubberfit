"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  LayoutDashboard,
  LayoutGrid,
  Rocket,
} from "lucide-react"

import { cn } from "@/app/lib/utils"
import { useAuth } from "@/app/contexts/AuthContext"

function getInitials(email: string): string {
  const local = email.split("@")[0]
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

interface AlertsApiResponse {
  alerts: unknown[]
}

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
  { icon: HeartPulse, label: "Health", href: "/admin/health" },
  { icon: BarChart3, label: "Analytics", href: "/admin/analytics" },
  { icon: Rocket, label: "Deployments", href: "/admin/deployments" },
  { icon: Building2, label: "Organizations", href: "/admin/orgs" },
] as const

export function AdminSidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)
  const profileRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()

  const email = user?.email ?? ""
  const displayName = user?.name ?? ""
  const initials = email ? getInitials(email) : "IO"

  const fetchAlertCount = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/alerts")
      if (!res.ok) return
      const body = (await res.json()) as AlertsApiResponse
      setAlertCount(body.alerts.length)
    } catch (_error) {
      // silently ignore
    }
  }, [])

  useEffect(() => {
    fetchAlertCount()
    const interval = setInterval(fetchAlertCount, 60_000)
    return () => clearInterval(interval)
  }, [fetchAlertCount])

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
    <aside
      className={cn(
        "shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col h-screen sticky top-0 transition-all duration-200",
        isCollapsed ? "w-14" : "w-56"
      )}
    >
      {/* Logo */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-zinc-800 overflow-hidden">
        {!isCollapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-zinc-100 tracking-tight truncate">A&amp;A Ops</span>
            <span className="text-[10px] font-semibold bg-violet-600 text-white px-1.5 py-0.5 rounded shrink-0">
              ADMIN
            </span>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed((v) => !v)}
          className={cn(
            "w-6 h-6 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0",
            isCollapsed && "mx-auto"
          )}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
          const isActive = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href)
          return (
            <div key={href} className="relative group">
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isCollapsed && "justify-center px-2",
                  isActive ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                )}
                title={isCollapsed ? label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!isCollapsed && label}
              </Link>
              {isCollapsed && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  {label}
                </div>
              )}
            </div>
          )
        })}
      </nav>

    </aside>
  )
}
