"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  BarChart3,
  Bell,
  FileText,
  History,
  LayoutDashboard,
  Package,
  Plus,
  Scissors,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/app/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/app/components/ui/command"
import { useRole } from "@/src/infrastructure/services/useRole"
import type { Permission } from "@/src/application/permissions"

/**
 * Command palette (⌘K). Linear/Vercel-style — operators type a few
 * letters or press a keyboard chord (`g d` = go to dashboard) and
 * jump straight to a surface.
 *
 * Three command groups:
 *   - Go to …   — route navigation. Every top-level surface is
 *                 a command.
 *   - Actions   — quick actions (Add Roll, New PO, Plan cut).
 *                 Deep-link to the target surface with a query
 *                 param the page can pick up to auto-open the
 *                 relevant dialog.
 *   - Settings  — Profile, General, Notifications preferences.
 *
 * Keyboard chords: pressing `g` followed by a single letter (d,
 * n, j, i, p, s, a, h) within 1.2s navigates without opening the
 * palette. This mirrors Linear's navigation model and stays out
 * of the operator's way once they've memorized their surface.
 */

interface Command {
  id: string
  group: "Go to" | "Actions" | "Settings"
  icon: LucideIcon
  label: string
  href: string
  /** Single-letter chord after `g`. Omit to exclude from chords. */
  chord?: string
  /** Gate by permission; hidden when role lacks it. */
  requiredPermission?: Permission
}

const COMMANDS: ReadonlyArray<Command> = [
  {
    id: "nav.dashboard",
    group: "Go to",
    icon: LayoutDashboard,
    label: "Dashboard",
    href: "/dashboard",
    chord: "d",
  },
  {
    id: "nav.cutting-engine",
    group: "Go to",
    icon: Scissors,
    label: "Cutting Engine — Auto nest",
    href: "/dashboard/cutting-engine",
    chord: "n",
    requiredPermission: "accessCutPlanner",
  },
  {
    id: "nav.cutting-engine-free-roam",
    group: "Go to",
    icon: Scissors,
    label: "Cutting Engine — Free roam",
    href: "/dashboard/cutting-engine/free-roam",
    requiredPermission: "accessCutPlanner",
  },
  {
    id: "nav.history",
    group: "Go to",
    icon: History,
    label: "Cut History",
    href: "/dashboard/history",
    chord: "h",
    requiredPermission: "viewCutHistory",
  },
  {
    id: "nav.inventory",
    group: "Go to",
    icon: Package,
    label: "Inventory",
    href: "/dashboard/inventory",
    chord: "i",
    requiredPermission: "viewInventory",
  },
  {
    id: "nav.pos",
    group: "Go to",
    icon: ShoppingCart,
    label: "Purchase Orders",
    href: "/dashboard/inventory/purchase-orders",
    chord: "p",
    requiredPermission: "manageRolls",
  },
  {
    id: "nav.suppliers",
    group: "Go to",
    icon: Truck,
    label: "Suppliers",
    href: "/dashboard/inventory/materials/suppliers",
    requiredPermission: "manageSuppliers",
  },
  {
    id: "nav.analytics",
    group: "Go to",
    icon: BarChart3,
    label: "Analytics",
    href: "/dashboard/analytics/waste",
    chord: "a",
    requiredPermission: "accessAnalytics",
  },
  {
    id: "nav.reports",
    group: "Go to",
    icon: FileText,
    label: "Reports",
    href: "/dashboard/analytics/reports",
    requiredPermission: "viewReports",
  },
  {
    id: "nav.notifications",
    group: "Go to",
    icon: Bell,
    label: "Notifications",
    href: "/dashboard/notifications",
  },

  {
    id: "act.new-po",
    group: "Actions",
    icon: Plus,
    label: "Create purchase order",
    href: "/dashboard/inventory/purchase-orders?action=new",
    requiredPermission: "manageRolls",
  },
  {
    id: "act.new-roll",
    group: "Actions",
    icon: Plus,
    label: "Add inventory roll",
    href: "/dashboard/inventory?action=add-roll",
    requiredPermission: "manageRolls",
  },
  {
    id: "act.import-csv",
    group: "Actions",
    icon: Upload,
    label: "Import rolls from CSV",
    href: "/dashboard/inventory/import",
    requiredPermission: "manageRolls",
  },
  {
    id: "act.plan-cut",
    group: "Actions",
    icon: Scissors,
    label: "Plan a cut",
    href: "/dashboard/cutting-engine",
    requiredPermission: "createCut",
  },

  {
    id: "settings.profile",
    group: "Settings",
    icon: Users,
    label: "Profile & account",
    href: "/dashboard/settings/profile",
  },
  {
    id: "settings.general",
    group: "Settings",
    icon: Settings,
    label: "General settings",
    href: "/dashboard/settings/general",
    requiredPermission: "manageUsers",
  },
  {
    id: "settings.notifications",
    group: "Settings",
    icon: Bell,
    label: "Notification preferences",
    href: "/dashboard/settings/notifications",
  },
]

const CHORD_WINDOW_MS = 1200

export function SearchDialog() {
  const router = useRouter()
  const { can } = useRole()
  const [open, setOpen] = React.useState(false)

  const visible = React.useMemo(
    () => COMMANDS.filter((c) => !c.requiredPermission || can(c.requiredPermission)),
    [can]
  )

  const chordMap = React.useMemo(() => {
    const map = new Map<string, Command>()
    for (const cmd of visible) {
      if (cmd.chord) map.set(cmd.chord, cmd)
    }
    return map
  }, [visible])

  const handleSelect = React.useCallback(
    (cmd: Command) => {
      setOpen(false)
      router.push(cmd.href)
    },
    [router]
  )

  // ⌘K / ctrl+K → open palette.
  // g + <letter> within CHORD_WINDOW_MS → direct navigation.
  React.useEffect(() => {
    let gPressedAt: number | null = null

    const down = (e: KeyboardEvent) => {
      // Skip chord capture when typing in an editable field.
      const target = e.target as HTMLElement | null
      const isEditable =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable

      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
        return
      }

      if (isEditable) return

      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        gPressedAt = Date.now()
        return
      }

      if (gPressedAt !== null && Date.now() - gPressedAt <= CHORD_WINDOW_MS) {
        const cmd = chordMap.get(e.key.toLowerCase())
        gPressedAt = null
        if (cmd) {
          e.preventDefault()
          router.push(cmd.href)
        }
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [chordMap, router])

  const groups = ["Go to", "Actions", "Settings"] as const

  return (
    <>
      <Button
        variant="link"
        className="!px-0 font-normal text-muted-foreground hover:no-underline"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        Search
        <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px]">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Jump to a page, run an action, or tweak settings…" />
        <CommandList>
          <CommandEmpty>No matches — try a surface name or action verb.</CommandEmpty>
          {groups.map((group, i) => {
            const items = visible.filter((c) => c.group === group)
            if (items.length === 0) return null
            return (
              <React.Fragment key={group}>
                {i !== 0 && <CommandSeparator />}
                <CommandGroup heading={group}>
                  {items.map((cmd) => {
                    const Icon = cmd.icon
                    return (
                      <CommandItem
                        key={cmd.id}
                        value={`${cmd.label} ${cmd.id}`}
                        onSelect={() => handleSelect(cmd)}
                        className="group !py-1.5"
                      >
                        <Icon />
                        <span>{cmd.label}</span>
                        {cmd.chord && (
                          <span className="ml-auto flex items-center gap-1">
                            <kbd className="inline-flex h-5 min-w-5 select-none items-center justify-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground group-data-[selected=true]:bg-background group-data-[selected=true]:text-foreground">
                              g
                            </kbd>
                            <span className="sr-only"> then </span>
                            <kbd className="inline-flex h-5 min-w-5 select-none items-center justify-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground group-data-[selected=true]:bg-background group-data-[selected=true]:text-foreground">
                              {cmd.chord}
                            </kbd>
                          </span>
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </React.Fragment>
            )
          })}
        </CommandList>
      </CommandDialog>
    </>
  )
}
