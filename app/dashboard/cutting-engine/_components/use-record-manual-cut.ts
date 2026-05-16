"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import { saveCut } from "@/app/actions/cut-history"
import type { CutHistoryLayoutJson } from "@/src/infrastructure/models/supabase"
import { CURRENT_LAYOUT_JSON_VERSION } from "@/src/infrastructure/models/cut-history-layout"
import type { PartTemplate } from "./preset-template-data"
import type { ManualPlacement } from "./free-roam-collision"
import { DEFAULT_KERF_IN, type StockConfig } from "./stock-preview-configurator"
import type { SimpleCutMetrics } from "./nesting-visualizer-types"

/**
 * Records a manual cut via the `saveCut` server action with
 * `source: "manual"` plus a `layout_json` snapshot of the placements
 * + parts queue + stock so the Saved-layouts dropdown can re-hydrate
 * the canvas when the operator picks the row. Manual cuts have no
 * PDF, so `pdf_url` is omitted; the cut_history row's id is
 * generated client-side to keep the action input shape consistent
 * with the auto-cut path.
 *
 * Owns its own `isRecordingCut` flag for disabling the button;
 * errors surface via toast.
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
        version: CURRENT_LAYOUT_JSON_VERSION,
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
        // Generated client-side to match the auto-cut save flow shape.
        // Manual cuts have no PDF, so the storage filename never gets
        // referenced — but a periodic orphan-PDF sweep still expects
        // every cut_history row id to be a UUID it can recognize.
        cutId: crypto.randomUUID(),
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

      let result: Awaited<ReturnType<typeof saveCut>>
      try {
        result = await saveCut(payload)
      } catch (err) {
        toast.error("Failed to record manual cut", {
          description: err instanceof Error ? err.message : undefined,
        })
        return
      }

      if (!result.ok) {
        const description = result.detail
          ? result.code
            ? `${result.detail} (${result.code})`
            : result.detail
          : result.error
        toast.error("Failed to record manual cut", { description })
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
