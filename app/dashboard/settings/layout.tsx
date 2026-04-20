"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

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
 */

const TABS: ReadonlyArray<{ id: string; href: string; label: string }> = [
  { id: "general", href: "/dashboard/settings/general", label: "General" },
  { id: "profile", href: "/dashboard/settings/profile", label: "Profile & account" },
  { id: "materials", href: "/dashboard/settings/materials", label: "Materials" },
  { id: "notifications", href: "/dashboard/settings/notifications", label: "Notifications" },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""
  const router = useRouter()

  const activeId = TABS.find((t) => pathname.startsWith(t.href))?.id ?? "general"

  return (
    <div className="flex h-full flex-col">
      <nav
        aria-label="Settings sections"
        className="sticky top-0 z-10 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur md:px-6"
      >
        <div className="mx-auto flex max-w-[1800px] items-center gap-0.5 py-2">
          {TABS.map((tab) => {
            const isActive = tab.id === activeId
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => router.push(tab.href)}
                className={cn(
                  "relative rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </nav>
      <div className="flex-1">{children}</div>
    </div>
  )
}
