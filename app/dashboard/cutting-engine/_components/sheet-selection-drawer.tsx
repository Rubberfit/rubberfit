"use client"

import { useRef, useEffect } from "react"
import type { PlacedPart } from "./layout-model"
import { partDimensionLabel, tagPillStyle } from "./cut-legend"
import { X } from "lucide-react"
import { cn } from "@/app/lib/utils"

interface SheetSelectionDrawerProps {
  part: PlacedPart | null
  placementIndex: number
  totalPlacements: number
  sheetAreaSharePct: number
  onClose: () => void
  /**
   * Phase 5 PR 6 — cross-sheet selection. When the selected part lives
   * on a sheet that is not currently active in the thumbnail strip,
   * the drawer surfaces a "On Sheet N" indicator + "Jump to Sheet N"
   * button so the operator can navigate to it without manual hunting.
   * Both props are optional so single-sheet (no strip) callers can omit
   * them — the off-sheet UI then never renders.
   */
  partSheetIndex?: number
  activeSheetIndex?: number
  /** Total sheets in the pack result; used by aria/label copy when present. */
  totalSheets?: number
  onJumpToSheet?: (sheetIndex: number) => void
}

export default function SheetSelectionDrawer({
  part,
  placementIndex,
  totalPlacements,
  sheetAreaSharePct,
  onClose,
  partSheetIndex,
  activeSheetIndex,
  totalSheets,
  onJumpToSheet,
}: SheetSelectionDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Auto-focus the close button each time a part is selected. The
  // empty-deps version below this used to run on mount when `part`
  // was still `null` — the component returns null before the ref
  // attaches, so the focus call hit a `null` ref and silently no-op'd.
  useEffect(() => {
    if (part !== null) {
      closeButtonRef.current?.focus()
    }
  }, [part])

  if (part === null) {
    return null
  }

  const pillStyle = tagPillStyle(part.label)

  return (
    <aside
      role="complementary"
      aria-labelledby="part-details-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onClose()
        }
      }}
      className={cn(
        "fixed z-50 bg-background border-border shadow-lg overflow-y-auto",
        "transition-all motion-reduce:transition-none",
        "inset-x-0 bottom-0 max-h-[50vh] rounded-t-xl border-t",
        "sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-auto sm:w-80 sm:max-h-none sm:rounded-none sm:border-l sm:border-t-0"
      )}
    >
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border"
            style={{
              backgroundColor: pillStyle.backgroundColor,
              borderColor: pillStyle.borderColor,
              color: pillStyle.color,
            }}
          >
            {part.label}
          </span>
          <span className="text-muted-foreground">·</span>
          <h2 id="part-details-title" className="text-sm font-medium truncate">
            {partDimensionLabel(part)}
          </h2>
        </div>
        <button
          aria-label="Close part details"
          ref={closeButtonRef}
          onClick={onClose}
          className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-sm text-muted-foreground px-4 py-3">
        Placement {placementIndex} of {totalPlacements}
      </p>

      {partSheetIndex !== undefined &&
        activeSheetIndex !== undefined &&
        partSheetIndex !== activeSheetIndex && (
          <>
            <hr className="border-border" />
            <div className="px-4 py-3 space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                On Sheet {partSheetIndex + 1}
                {totalSheets ? ` of ${totalSheets}` : ""}
              </p>
              <p className="text-sm text-foreground">
                The selected part is on a different sheet than the one currently displayed.
              </p>
              {onJumpToSheet && (
                <button
                  type="button"
                  onClick={() => onJumpToSheet(partSheetIndex)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Jump to Sheet {partSheetIndex + 1}
                </button>
              )}
            </div>
          </>
        )}

      <hr className="border-border" />

      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Sheet area share</span>
          <span className="font-medium tabular-nums">{sheetAreaSharePct.toFixed(1)}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            style={{ width: `${Math.min(100, Math.max(0, sheetAreaSharePct))}%` }}
            className="h-full bg-teal-600 transition-all motion-reduce:transition-none"
          />
        </div>
      </div>

      <hr className="border-border" />

      <p className="text-xs text-muted-foreground px-4 py-3">
        Press <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">Esc</kbd> to
        deselect
      </p>
    </aside>
  )
}
