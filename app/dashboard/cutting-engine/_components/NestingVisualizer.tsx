"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

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

  return (
    <div className="relative">
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
      />
      <PackTimerOverlay active={isPacking} />
    </div>
  )
}

// Small badge that ticks elapsed seconds while a pack is in flight. Lives in
// the top-right of the visualizer so the operator can see how long the
// current Rust call has been running — useful both during the empty/loading
// state of a first pack and during auto-boost continuations where the
// previous sheet stays on screen.
function PackTimerOverlay({ active }: { active: boolean }) {
  const elapsedMs = useElapsedMs(active)
  if (!active) return null
  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
      <span className="text-xs font-medium tabular-nums text-slate-700 dark:text-slate-200">
        {(elapsedMs / 1000).toFixed(1)}s
      </span>
    </div>
  )
}

// Tracks elapsed milliseconds since `active` last flipped true. Resets to 0
// when `active` flips false. Updates every 100 ms — fine-grained enough to
// show tenths of a second without burning frames at 60 fps.
function useElapsedMs(active: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(0)
  useEffect(() => {
    if (!active) {
      setElapsedMs(0)
      return
    }
    const start = performance.now()
    setElapsedMs(0)
    const id = setInterval(() => {
      setElapsedMs(performance.now() - start)
    }, 100)
    return () => clearInterval(id)
  }, [active])
  return elapsedMs
}
