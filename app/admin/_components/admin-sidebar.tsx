"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Building2, HeartPulse, LayoutDashboard, Rocket } from "lucide-react"

import { cn } from "@/app/lib/utils"

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
  { icon: HeartPulse, label: "Health", href: "/admin/health" },
  { icon: BarChart3, label: "Analytics", href: "/admin/analytics" },
  { icon: Rocket, label: "Deployments", href: "/admin/deployments" },
  { icon: Building2, label: "Organizations", href: "/admin/orgs" },
] as const

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="h-12 flex items-center gap-2 px-4 border-b border-zinc-800">
        <span className="font-mono font-bold text-zinc-100 tracking-tight">REMA OPS</span>
        <span className="text-[10px] font-semibold bg-violet-600 text-white px-1.5 py-0.5 rounded">
          ADMIN
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
          const isActive =
            href === "/admin" ? pathname === "/admin" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-zinc-800">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            IO
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-200 truncate">Internal Ops</p>
            <p className="text-[10px] text-zinc-500 truncate">ops@rema.internal</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
