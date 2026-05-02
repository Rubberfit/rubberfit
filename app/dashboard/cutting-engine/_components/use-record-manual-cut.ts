"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import type { CutHistoryLayoutJson } from "@/src/infrastructure/models/supabase"
import type { PartTemplate } from "./preset-template-data"
import type { ManualPlacement } from "./free-roam-collision"
import { DEFAULT_KERF_IN, type StockConfig } from "./stock-preview-configurator"
import type { SimpleCutMetrics } from "./nesting-visualizer-types"

/**
 * POSTs a manual cut to `/api/cuts/history` with `source: "manual"`
 * plus a `layout_json` snapshot of the placements + parts queue +
 * stock so the Saved-layouts dropdown can re-hydrate the canvas when
 * the operator picks the row. Owns its own `isRecordingCut` flag for
 * disabling the button; errors surface via toast.
 *
 * The route's DB column defaults to `auto`, so a degraded payload
 * without `source` still wouldn't masquerade as a manual cut.
 */
export function useRecordManualCut(
  stock: StockConfig,
  cutMetrics: SimpleCutMetrics | null,
  placements: ManualPlacement[],
  parts: PartTemplate[],
  onCutRecorded?: () => void
): { isRecordingCut: boolean; recordCut: () => Promise<void> } {
  const [isRecordingCut, setIsRecordingCut] = useState(false)
  // Ref guard — `isRecordingCut` via closure is stale across rapid
  // double-clicks (both calls pass the check before the state
  // update propagates). The ref is synchronously set inside the
  // callback so the second call short-circuits.
  const recordingRef = useRef(false)

  const recordCut = useCallback(async () => {
    if (recordingRef.current) return
    if (!cutMetrics || (cutMetrics.partsCompleted ?? 0) === 0) {
      toast.error("Place at least one part before recording")
      return
    }
    recordingRef.current = true
    setIsRecordingCut(true)
    try {
      // Manual cuts don't map to a STOCK_PRESET, so material_id is 0
      // (the server treats 0 as a "no preset" sentinel on manual cuts).
      // The stock label is derived from the dimensions so the Saved
      // layouts dropdown has something human-readable to show.
      const stockLabel = `Manual ${stock.width}" × ${stock.length}" × ${stock.thickness}"`

      // Sanitize kerf before persisting: NaN / Infinity / negative
      // values would propagate into both the snapshot and the canonical
      // row. `stock.kerf` should already be valid (the kerf input has
      // min=0 etc.) but defending here keeps the persisted history
      // payload trustworthy regardless of upstream state drift.
      // Falls back to DEFAULT_KERF_IN (matching the load-side path in
      // `use-load-manual-cut.ts`) so a malformed value gets repaired
      // to the standard default rather than persisted as a misleading
      // zero-clearance cut.
      const normalizedKerf =
        Number.isFinite(stock.kerf) && stock.kerf >= 0 ? stock.kerf : DEFAULT_KERF_IN

      // Snapshot everything needed to re-hydrate the canvas. `parts`
      // is cast to `unknown[]` in the DB type because the column is
      // a pass-through JSONB blob (the client owns the schema).
      // Version the payload so a future shape change can detect old
      // rows and migrate forward gracefully.
      const layoutJson: CutHistoryLayoutJson = {
        version: 1,
        kind: "manual",
        placements: placements.map((p) => ({
          id: p.id,
          templateId: p.templateId,
          x: p.x,
          y: p.y,
          rotationRad: p.rotationRad,
        })),
        parts,
        stock: {
          width: stock.width,
          length: stock.length,
          thickness: stock.thickness,
          material: stock.material,
          costPerSqft: stock.costPerSqft ?? null,
          kerf: normalizedKerf,
        },
      }

      const payload = {
        material_id: 0,
        part_id: 1,
        roll_id: null,
        job_id: null,
        offcut_pieces: [],
        cut_length: stock.length,
        cut_width: stock.width,
        cut_thickness: stock.thickness,
        kerf: normalizedKerf,
        cut_amount: cutMetrics.partsCompleted,
        parts_completed: cutMetrics.partsCompleted,
        cut_pieces: cutMetrics.cutPieces,
        material_used_sqft: cutMetrics.materialUsedSqFt,
        reusable_offset_sqft: cutMetrics.reusableOffsetSqFt,
        scrap_sqft: cutMetrics.scrapSqFt,
        fab_score: cutMetrics.fabScore,
        stock_label: stockLabel,
        cost_per_sqft: stock.costPerSqft ?? null,
        source: "manual" as const,
        layout_json: layoutJson,
      }
      const res = await fetch("/api/cuts/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text()
        toast.error("Failed to record manual cut", {
          description: text.slice(0, 200) || `HTTP ${res.status}`,
        })
        return
      }
      toast.success("Manual cut recorded")
      onCutRecorded?.()
    } catch (err) {
      toast.error("Failed to record manual cut", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setIsRecordingCut(false)
      recordingRef.current = false
    }
  }, [cutMetrics, onCutRecorded, parts, placements, stock])

  return { isRecordingCut, recordCut }
}
