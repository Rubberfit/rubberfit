"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/app/lib/utils"

/**
 * Settings shell. Nested `/dashboard/settings/*` sub-routes
 * share the tab strip below so operators can move between
 * General / Profile / Materials / Notification preferences
 * without leaving the Settings context.
 *
 * Sub-page `page.tsx` files own their own `PageShell` +
 * `PageHeader` per the Task 2 pattern; this layout only
 * contributes the tab chrome.
 *
 * Phase 2: mono uppercase underlined tabs (replaces the Phase 1
 * `bg-muted` chip strip). See
 * `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §3.6.
 */

const TABS: ReadonlyArray<{ id: string; href: string; label: string }> = [
  { id: "general", href: "/dashboard/settings/general", label: "General" },
  { id: "profile", href: "/dashboard/settings/profile", label: "Profile" },
  { id: "materials", href: "/dashboard/settings/materials", label: "Materials" },
  { id: "notifications", href: "/dashboard/settings/notifications", label: "Notifications" },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""

  const activeId = TABS.find((t) => pathname.startsWith(t.href))?.id ?? "general"

  return (
    <div className="flex h-full flex-col">
      <nav
        aria-label="Settings sections"
        className="sticky top-0 z-10 overflow-x-auto border-b border-border-subtle bg-background/95 px-4 backdrop-blur md:px-6"
      >
        <div className="mx-auto flex max-w-[1800px] items-center gap-6 py-2">
          {TABS.map((tab) => {
            const isActive = tab.id === activeId
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  "relative font-mono text-[11px] uppercase tracking-[0.22em] py-2 whitespace-nowrap transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:rounded-sm",
                  isActive
                    ? "text-foreground after:absolute after:inset-x-0 after:bottom-[-1px] after:h-[2px] after:bg-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </nav>
      <div className="flex-1">{children}</div>
    </div>
  )
}
