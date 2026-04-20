"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { cn } from "@/app/lib/utils"

/**
 * Analytics shell. Every `/dashboard/analytics/*` sub-route
 * shares the tab strip below so operators can jump between
 * Waste / Waste Comparison / Material Usage / Cost Reports /
 * Trends / Reports without leaving the Analytics context.
 *
 * The tab itself is a client-side router.push so the URL stays
 * the canonical state — deep links work, bookmarks work, and
 * refresh lands the user exactly where they were.
 *
 * Sub-page `page.tsx` files still own their own `PageShell` +
 * `PageHeader` per the Task 2 pattern; this layout only adds
 * the tab chrome at the top.
 */

const TABS: ReadonlyArray<{ id: string; href: string; label: string }> = [
  { id: "waste", href: "/dashboard/analytics/waste", label: "Waste" },
  { id: "waste-comparison", href: "/dashboard/analytics/waste-comparison", label: "Period comparison" },
  { id: "usage", href: "/dashboard/analytics/usage", label: "Material usage" },
  { id: "costs", href: "/dashboard/analytics/costs", label: "Cost reports" },
  { id: "trends", href: "/dashboard/analytics/trends", label: "Trends" },
  { id: "reports", href: "/dashboard/analytics/reports", label: "Reports" },
]

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""
  const router = useRouter()

  const activeId = TABS.find((t) => pathname.startsWith(t.href))?.id ?? "waste"

  return (
    <div className="flex h-full flex-col">
      <nav
        aria-label="Analytics sections"
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
