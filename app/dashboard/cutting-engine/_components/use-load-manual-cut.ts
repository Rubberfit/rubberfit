"use client"

import { useCallback } from "react"
import { toast } from "sonner"

import type { CutHistory } from "@/src/infrastructure/models/supabase"
import type { PartTemplate } from "./preset-template-data"
import type { StockConfig } from "./stock-preview-configurator"
import type { ManualPlacement } from "./free-roam-collision"

interface LoadManualCutArgs {
  onPartsChange: (parts: PartTemplate[]) => void
  onStockChange: (stock: StockConfig) => void
  setPlacements: (p: ManualPlacement[]) => void
  onAfterLoadCut?: (cut: CutHistory) => void
}

/**
 * Restores a saved manual cut onto the Free-roam canvas.
 *
 * Contract:
 *   - Rejects auto-nest rows and any manual row lacking `layout_json`
 *     (pre-migration rows) with a toast explaining why.
 *   - Accepts malformed blobs defensively and bails with a toast
 *     rather than throwing — the JSONB column is effectively
 *     untrusted input since it round-trips through the DB.
 *   - Overwrites the current parts queue / placements / stock with
 *     the snapshot. The operator sees the canvas rebuild from the
 *     saved state — no partial merge.
 */
export function useLoadManualCut({
  onPartsChange,
  onStockChange,
  setPlacements,
  onAfterLoadCut,
}: LoadManualCutArgs): (cut: CutHistory) => void {
  return useCallback(
    (cut: CutHistory) => {
      if (cut.source !== "manual") {
        toast.message("That cut is an auto-nest row", {
          description: "Auto-nest layouts aren't stored as placements — use Auto nest to re-run.",
        })
        return
      }
      if (cut.layout_json == null) {
        toast.message("No saved layout on this cut", {
          description: `Cut #${cut.id} was recorded before the layout snapshot existed. Save a fresh cut and try loading that one.`,
        })
        return
      }
      // Discriminated union: bail if this is an auto-nest snapshot
      // that snuck in (shouldn't happen — Reopen routes manual cuts
      // here — but defensively reject).
      const snapshot = cut.layout_json
      if (snapshot.kind === "auto") {
        toast.error("This cut has an auto-nest snapshot, not a manual layout")
        return
      }
      if (!Array.isArray(snapshot.placements) || !Array.isArray(snapshot.parts)) {
        toast.error("Saved layout is malformed — skipping load")
        return
      }
      onPartsChange(snapshot.parts as PartTemplate[])
      setPlacements(
        snapshot.placements.map((p) => ({
          id: p.id,
          templateId: p.templateId,
          x: p.x,
          y: p.y,
          rotationRad: p.rotationRad,
        }))
      )
      if (snapshot.stock) {
        onStockChange({
          width: snapshot.stock.width,
          length: snapshot.stock.length,
          thickness: snapshot.stock.thickness,
          material: snapshot.stock.material ?? "",
          costPerSqft: snapshot.stock.costPerSqft ?? undefined,
        })
      }
      toast.success("Layout loaded onto canvas")
      onAfterLoadCut?.(cut)
    },
    [onAfterLoadCut, onPartsChange, onStockChange, setPlacements]
  )
}
