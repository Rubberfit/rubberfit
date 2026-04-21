"use client"

import { useEffect, useState } from "react"
import { X, Moon, Sun } from "lucide-react"
import { cn } from "@/app/lib/utils"
import { usePreferencesStore } from "@/app/stores/preferences/preferences-provider"

const ACCENT_KEY = "rubberfit.prefs.accent.v1"

type AccentName = "indigo" | "teal" | "red" | "magenta" | "green"

const ACCENTS: Array<{ name: AccentName; color: string; label: string }> = [
  { name: "indigo", color: "bg-indigo-500", label: "Indigo" },
  { name: "teal", color: "bg-teal-500", label: "Teal" },
  { name: "red", color: "bg-red-500", label: "Red" },
  { name: "magenta", color: "bg-pink-500", label: "Magenta" },
  { name: "green", color: "bg-emerald-500", label: "Green" },
]

export function TweaksPanel() {
  const [open, setOpen] = useState(false)
  const [accent, setAccent] = useState<AccentName>("indigo")

  const themeMode = usePreferencesStore((s) => s.themeMode)
  const resolvedTheme = usePreferencesStore((s) => s.resolvedThemeMode)
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode)
  const sidebarCollapsible = usePreferencesStore((s) => s.sidebarCollapsible)
  const setSidebarCollapsible = usePreferencesStore((s) => s.setSidebarCollapsible)

  // Hydrate accent from localStorage on mount only
  useEffect(() => {
    const stored = localStorage.getItem(ACCENT_KEY) as AccentName | null
    if (stored && ACCENTS.some((a) => a.name === stored)) {
      setAccent(stored)
      document.documentElement.setAttribute("data-accent", stored)
    }
  }, [])

  function handleAccent(name: AccentName) {
    setAccent(name)
    localStorage.setItem(ACCENT_KEY, name)
    document.documentElement.setAttribute("data-accent", name)
  }

  function handleThemeToggle() {
    setThemeMode(resolvedTheme === "dark" ? "light" : "dark")
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background shadow-lg hover:opacity-80 transition-opacity"
        aria-label="Open tweaks panel"
      >
        <span className="text-xs font-bold">✦</span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-52 rounded-xl border border-border/60 bg-background/95 backdrop-blur-md shadow-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Tweaks</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close tweaks panel"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Theme */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Theme
        </p>
        <div className="flex rounded-md border border-border/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setThemeMode("light")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors",
              resolvedTheme === "light"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            <Sun className="h-3.5 w-3.5" />
            Light
          </button>
          <button
            type="button"
            onClick={() => setThemeMode("dark")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors",
              resolvedTheme === "dark"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            <Moon className="h-3.5 w-3.5" />
            Dark
          </button>
        </div>
      </div>

      {/* Accent */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Accent
        </p>
        <div className="flex gap-2">
          {ACCENTS.map(({ name, color, label }) => (
            <button
              key={name}
              type="button"
              aria-label={label}
              title={label}
              onClick={() => handleAccent(name)}
              className={cn(
                "h-6 w-6 rounded-full transition-transform",
                color,
                accent === name ? "ring-2 ring-offset-1 ring-foreground scale-110" : "hover:scale-105"
              )}
            />
          ))}
        </div>
      </div>

      {/* Layout */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Sidebar
        </p>
        <div className="flex rounded-md border border-border/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setSidebarCollapsible("offcanvas")}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium transition-colors",
              sidebarCollapsible === "offcanvas"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            Classic
          </button>
          <button
            type="button"
            onClick={() => setSidebarCollapsible("icon")}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium transition-colors",
              sidebarCollapsible === "icon"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            Rail
          </button>
        </div>
      </div>
    </div>
  )
}
