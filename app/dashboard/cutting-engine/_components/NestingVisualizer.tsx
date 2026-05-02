"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"

// Re-export types needed by external consumers
export type { SimplePartType, SimpleCutDirection } from "./nesting-visualizer-types"

import {
  fromLayoutModelsToMultiSheetResult,
  fromLayoutModelToPreview,
  type LayoutModel,
} from "./layout-model"

import type {
  NestingVisualizerProps,
  RectLikePreview,
  SimpleCutMetrics,
} from "./nesting-visualizer-types"

import NestingVizSimpleMode from "./nesting-viz-simple-mode"

// ── Renderer ─────────────────────────────────────────────────────────────────
//
// Post-Phase 3c: NestingVisualizer is a thin LayoutModel renderer. The page
// owns the Rust pack pipeline via `usePackJob` and passes finished
// `LayoutModel[]` in via `layouts`. There is no TS preview generation, no
// async worker pool, no NFP optimizer hook — pre-Pack the visualizer paints
// an empty stock card; post-Pack it synthesises a `MultiSheetResult` from
// the supplied layouts and feeds the existing renderer (`NestingVizSimpleMode`).

interface NestingVisualizerExtraProps {
  layouts?: LayoutModel[]
  onLayoutChange?: (layouts: LayoutModel[]) => void
  /**
   * True while a Rust pack call is in flight (first pack OR auto-boost
   * continuation). Drives the spinner + elapsed-seconds overlay. Distinct
   * from `packGateStatus`: continuation re-packs keep the gate at "done"
   * (so the previous sheet stays rendered) but still set `isPacking=true`.
   */
  isPacking?: boolean
}

export default function NestingVisualizer({
  defaultRollWidth = 48,
  defaultRollLength = 96,
  layouts,
  frozenLayouts,
  packGateStatus = "done",
  onMetricsChange,
  onLayoutChange,
  debugOverlays,
  isPacking = false,
}: NestingVisualizerProps & NestingVisualizerExtraProps) {
  const patternSeed = useId().replace(/:/g, "")
  const hasFrozenLayouts = (frozenLayouts?.length ?? 0) > 0
  const hasLiveLayouts = (layouts?.length ?? 0) > 0
  const showLive = !hasFrozenLayouts && packGateStatus === "done" && hasLiveLayouts

  // Renderer expects a non-null `SimplePartPreview` and a non-null sheet array.
  // Build these from `LayoutModel[]` via the inverse adapter that already
  // existed for frozen-layout restore.
  const activeLayouts: LayoutModel[] | null = hasFrozenLayouts
    ? (frozenLayouts ?? null)
    : showLive
      ? (layouts ?? null)
      : null

  const multiSheet = useMemo(
    () => (activeLayouts ? fromLayoutModelsToMultiSheetResult(activeLayouts) : null),
    [activeLayouts]
  )

  // Display dimensions: prefer the first layout's saved sheet dimensions
  // when available, otherwise fall back to the page-supplied stock
  // width/length for the empty-sheet card.
  const previewRollW = activeLayouts?.[0]?.sheetWidth ?? defaultRollWidth
  const previewRollL = activeLayouts?.[0]?.sheetLength ?? defaultRollLength

  const emptyPreview = useMemo<RectLikePreview>(() => {
    const stockArea = previewRollW * previewRollL
    return {
      renderShape: "rect",
      strategyName: "Empty sheet",
      strategyNote: packGateStatus === "packing" ? "Packing…" : "Press Pack to generate the layout",
      placementMode: "origin",
      wasteMode: "bands",
      cutPlanTitle: "",
      cutSteps: [],
      requestedUnits: 0,
      unitsCompleted: 0,
      overflowUnits: 0,
      piecesShown: 0,
      piecesPerUnit: 0,
      usedArea: 0,
      wasteArea: stockArea,
      wastePct: stockArea > 0 ? 100 : 0,
      reusableArea: stockArea,
      scrapArea: 0,
      occupiedWidth: 0,
      occupiedHeight: 0,
      items: [],
      offcutBands: [{ x: 0, y: 0, width: previewRollW, height: previewRollL }],
      scrapBands: [],
      placements: [],
      label: "",
      fabricationScore: 0,
    }
  }, [previewRollW, previewRollL, packGateStatus])

  const preview = useMemo(() => {
    if (multiSheet && multiSheet.sheets.length > 0) return multiSheet.sheets[0].preview
    if (activeLayouts && activeLayouts.length > 0) return fromLayoutModelToPreview(activeLayouts[0])
    return emptyPreview
  }, [multiSheet, activeLayouts, emptyPreview])

  // ── Metrics emit ──────────────────────────────────────────────────────────
  // Sum across layouts. Uses `LayoutModel` aggregates directly; we no longer
  // synthesise a `fabScore` since the Rust pipeline reports per-bin
  // efficiency and the page can decide whether to surface it.
  const lastEmittedMetricsSigRef = useRef<string | null>(null)
  useEffect(() => {
    if (!onMetricsChange) return
    if (!activeLayouts || activeLayouts.length === 0) return

    const bandToPiece = (band: { width: number; height: number }) => ({
      widthIn: Number(band.width.toFixed(4)),
      lengthIn: Number(band.height.toFixed(4)),
      areaSqft: Number(((band.width * band.height) / 144).toFixed(4)),
    })

    const partsCompleted = activeLayouts.reduce((s, l) => s + l.placedCount, 0)
    const cutPieces = partsCompleted // 1 placement = 1 cut piece in the Rust pipeline
    const materialUsedSqFt = activeLayouts.reduce((s, l) => s + l.usedAreaSqFt, 0)
    const reusableOffsetSqFt = activeLayouts.reduce((s, l) => s + l.reusableAreaSqFt, 0)
    const scrapSqFt = activeLayouts.reduce((s, l) => s + l.scrapAreaSqFt, 0)
    const fabSum = activeLayouts.reduce((s, l) => s + l.fabScore, 0)
    const fabScore = activeLayouts.length > 0 ? fabSum / activeLayouts.length : 0
    const offcutPieces = activeLayouts.flatMap((l) => l.offcuts.map(bandToPiece))

    const metrics: SimpleCutMetrics = {
      partsCompleted,
      cutPieces,
      materialUsedSqFt,
      reusableOffsetSqFt,
      scrapSqFt,
      fabScore,
      offcutPieces,
    }

    const sig = JSON.stringify(metrics)
    if (sig === lastEmittedMetricsSigRef.current) return
    lastEmittedMetricsSigRef.current = sig
    onMetricsChange(metrics)
  }, [activeLayouts, onMetricsChange])

  // ── Layout emit ───────────────────────────────────────────────────────────
  // Forward LayoutModel[] back to the page so the cut-history PDF + record
  // route can use the same post-rotation coordinates. Dedup by signature so
  // identical re-renders don't cascade into infinite parent re-renders.
  const lastEmittedLayoutsSigRef = useRef<string | null>(null)
  useEffect(() => {
    if (!onLayoutChange) return
    const next = activeLayouts ?? []
    const sig = JSON.stringify(next)
    if (sig === lastEmittedLayoutsSigRef.current) return
    lastEmittedLayoutsSigRef.current = sig
    onLayoutChange(next)
  }, [activeLayouts, onLayoutChange])

  const { packDurationMs, isPackLive, hasPackMeasurement } = usePackDurationMs(isPacking)
  // Suppress the pill when a saved cut is loaded — that result wasn't
  // packed in this session, so attributing the live timer to it would
  // be misleading.
  const showPackTimer = hasPackMeasurement && !hasFrozenLayouts

  return (
    <NestingVizSimpleMode
      preview={preview}
      previewRollW={previewRollW}
      previewRollL={previewRollL}
      patternSeed={patternSeed}
      viewMode="stock"
      optimizedResult={null}
      optimizedItems={null}
      isOptimizing={packGateStatus === "packing"}
      nfpError={null}
      multiSheet={multiSheet}
      layouts={activeLayouts ?? undefined}
      debugOverlays={debugOverlays}
      packDurationMs={packDurationMs}
      isPackLive={isPackLive}
      hasPackMeasurement={showPackTimer}
    />
  )
}

// Tracks the duration of the current (or most recent) Rust pack call:
//
// - While `active` is true, ticks every 100 ms so the header pill shows a
//   live "Time to Pack: 1.4s" counter.
// - When `active` flips false, freezes at the final duration so the operator
//   can see how long the last pack took (the pill stays on screen between
//   packs).
// - Resets to 0 when `active` flips back true (next pack starts).
//
// `hasPackMeasurement` is false only on the very first render of a session
// before any pack has run — that's when the pill should be hidden.
function usePackDurationMs(active: boolean): {
  packDurationMs: number
  isPackLive: boolean
  hasPackMeasurement: boolean
} {
  const [packDurationMs, setPackDurationMs] = useState(0)
  const [hasPackMeasurement, setHasPackMeasurement] = useState(false)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      // Pack just ended — capture the exact final duration (the last
      // interval tick may be up to 100 ms stale).
      if (startRef.current !== null) {
        setPackDurationMs(performance.now() - startRef.current)
        setHasPackMeasurement(true)
        startRef.current = null
      }
      return
    }
    startRef.current = performance.now()
    setPackDurationMs(0)
    setHasPackMeasurement(true)
    const id = setInterval(() => {
      if (startRef.current !== null) {
        setPackDurationMs(performance.now() - startRef.current)
      }
    }, 100)
    return () => clearInterval(id)
  }, [active])

  return { packDurationMs, isPackLive: active, hasPackMeasurement }
}
