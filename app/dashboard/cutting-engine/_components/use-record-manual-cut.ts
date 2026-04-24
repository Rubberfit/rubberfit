"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import type { StockConfig } from "./stock-preview-configurator"
import type { SimpleCutMetrics } from "./nesting-visualizer-types"

/**
 * POSTs a manual cut to `/api/cuts/history` with `source: "manual"`
 * so the Saved-layouts dropdown + analytics can distinguish it from
 * Auto-nest cuts. Owns its own `isRecordingCut` flag for disabling
 * the button; errors surface via toast so the rail stays dumb.
 *
 * The route's DB column defaults to `auto`, so a degraded payload
 * without `source` still wouldn't masquerade as a manual cut.
 */
export function useRecordManualCut(
  stock: StockConfig,
  cutMetrics: SimpleCutMetrics | null,
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
      const payload = {
        material_id: 0,
        part_id: 1,
        roll_id: null,
        job_id: null,
        offcut_pieces: [],
        cut_length: stock.length,
        cut_width: stock.width,
        cut_thickness: stock.thickness,
        cut_amount: cutMetrics.partsCompleted,
        parts_completed: cutMetrics.partsCompleted,
        cut_pieces: cutMetrics.cutPieces,
        material_used_sqft: cutMetrics.materialUsedSqFt,
        reusable_offset_sqft: cutMetrics.reusableOffsetSqFt,
        scrap_sqft: cutMetrics.scrapSqFt,
        fab_score: cutMetrics.fabScore,
        stock_label: null,
        cost_per_sqft: stock.costPerSqft ?? null,
        source: "manual" as const,
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
  }, [cutMetrics, onCutRecorded, stock])

  return { isRecordingCut, recordCut }
}
