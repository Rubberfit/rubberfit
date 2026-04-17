"use client"

import { usePathname } from "next/navigation"
import { Bell } from "lucide-react"

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

export function AdminTopbar() {
  const pathname = usePathname()
  const crumbs = getBreadcrumb(pathname)

  return (
    <header className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center px-6 justify-between shrink-0">
      <nav className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={crumb} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-zinc-600">/</span>}
            <span className={i === crumbs.length - 1 ? "text-zinc-100" : "text-zinc-500"}>
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <span className="text-[11px] font-semibold bg-emerald-900/60 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">
          PRODUCTION
        </span>
        <button className="w-8 h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors">
          <Bell className="w-4 h-4 text-zinc-400" />
        </button>
        <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white">
          IO
        </div>
      </div>
    </header>
  )
}
