"use client"

import { Circle, Square, Triangle, Minus } from "lucide-react"
import { cn } from "@/app/lib/utils"
import type { PartTemplate } from "./PresetDimensionSelector"

export type PartsFilter = "all" | "unplaced" | "rect" | "curved"

interface PartsQueuePanelProps {
  parts: PartTemplate[]
  activeFilter: PartsFilter
  onFilterChange: (f: PartsFilter) => void
}

const FILTERS: Array<{ key: PartsFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "unplaced", label: "Unplaced" },
  { key: "rect", label: "Rect" },
  { key: "curved", label: "Curved" },
]

function shapeIcon(partType: string) {
  switch (partType) {
    case "cylinder":
      return <Circle className="h-4 w-4 shrink-0" />
    case "cone":
      return <Triangle className="h-4 w-4 shrink-0" />
    case "trapezoid":
      return <Minus className="h-4 w-4 shrink-0 rotate-12" />
    default:
      return <Square className="h-4 w-4 shrink-0" />
  }
}

function partDims(part: PartTemplate): string {
  if (part.width !== undefined && part.length !== undefined)
    return `${part.width}" × ${part.length}"`
  if (part.diameter !== undefined) return `⌀ ${part.diameter}"`
  if (part.width !== undefined) return `${part.width}" wide`
  return part.label
}

function isCurved(partType: string) {
  return partType === "cylinder" || partType === "cone"
}

function filterParts(parts: PartTemplate[], filter: PartsFilter): PartTemplate[] {
  switch (filter) {
    case "rect":
      return parts.filter((p) => p.partType === "rectangle" || p.partType === "trapezoid")
    case "curved":
      return parts.filter((p) => isCurved(p.partType))
    case "unplaced":
    case "all":
    default:
      return parts
  }
}

export function PartsQueuePanel({ parts, activeFilter, onFilterChange }: PartsQueuePanelProps) {
  const totalCount = parts.reduce((sum, p) => sum + p.quantity, 0)
  const visible = filterParts(parts, activeFilter)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b border-border/40">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-foreground">Parts queue</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {totalCount} part{totalCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onFilterChange(key)}
              className={cn(
                "rounded-full px-3 py-0.5 text-xs font-medium transition-colors",
                activeFilter === key
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Parts list */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            {parts.length === 0
              ? "No parts added yet. Use the selector below to add parts."
              : "No parts match this filter."}
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {visible.map((part) => {
              const placed = 0 // A1: no packing results yet
              const total = part.quantity
              const allPlaced = placed >= total
              const anyPlaced = placed > 0

              return (
                <li
                  key={part.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
                >
                  <span className="text-muted-foreground">{shapeIcon(part.partType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{part.label}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{partDims(part)}</p>
                  </div>
                  <span
                    className={cn(
                      "text-xs tabular-nums font-medium shrink-0",
                      allPlaced
                        ? "text-emerald-600 dark:text-emerald-400"
                        : anyPlaced
                          ? "text-amber-500"
                          : "text-muted-foreground"
                    )}
                  >
                    {placed}/{total}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
