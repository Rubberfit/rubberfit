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
   * continuation). Combined with `isAutoBoostPending`, drives the
   * spinner + elapsed-seconds overlay so a multi-round pack reads as
   * one continuous measurement (the gap between rounds is microseconds
   * and shouldn't reset the timer).
   */
  isPacking?: boolean
  /**
   * True when the most recent Rust round returned overflow and a
   * follow-up round is queued. Suppresses the partial layout (the
   * operator never sees an intermediate round) and keeps the spinner
   * + timer running through the gap between rounds. False on first-
   * round successes and when the MAX_SHEETS cap fires (the partial
   * result is the final answer in that case).
   */
  isAutoBoostPending?: boolean
  /**
   * Phase 5 PR 7 — the most recent pack-cli failure surfaced by
   * `usePackJob`. When set, the visualizer renders the inline error
   * banner in place of the canvas. The error is independent of
   * `packGateStatus` (which is a UI timing primitive); a failed pack
   * leaves the gate at `done` with no layouts, so the renderer needs
   * this signal to distinguish "empty" from "broken."
   */
  packError?: string | null
  /** Called from the error banner's Retry button. Wired to `requestPack`. */
  onRetryPack?: () => void
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
  isAutoBoostPending = false,
  packError = null,
  onRetryPack,
}: NestingVisualizerProps & NestingVisualizerExtraProps) {
  const patternSeed = useId().replace(/:/g, "")
  const hasFrozenLayouts = (frozenLayouts?.length ?? 0) > 0
  const hasLiveLayouts = (layouts?.length ?? 0) > 0
  // Suppress the live layout while another auto-boost round is queued.
  // The partial result would only flash on screen for a moment before
  // being replaced by the next round's output — operators don't act on
  // intermediate rounds, so we keep the empty-card "Packing…" view
  // through the whole multi-round flow.
  const showLive =
    !hasFrozenLayouts && packGateStatus === "done" && hasLiveLayouts && !isAutoBoostPending

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

  const isPackingState = packGateStatus === "packing" || isPacking || isAutoBoostPending
  const emptyPreview = useMemo<RectLikePreview>(() => {
    const stockArea = previewRollW * previewRollL
    return {
      renderShape: "rect",
      strategyName: "Empty sheet",
      strategyNote: isPackingState ? "Packing…" : "Press Pack to generate the layout",
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
  }, [previewRollW, previewRollL, isPackingState])

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
    if (!activeLayouts || activeLayouts.length === 0) {
      // Reset the dedupe key so the next non-empty pack will re-emit
      // even if its metrics signature is identical to the previous
      // pack's. Without this, an invalidate → re-pack with unchanged
      // inputs would dedupe the emit and leave `cutMetrics` null,
      // which keeps Save Cut hidden over a valid layout.
      lastEmittedMetricsSigRef.current = null
      return
    }

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

  const { packDurationMs, isPackLive, hasPackMeasurement } = usePackDurationMs(
    isPacking || isAutoBoostPending
  )
  // Suppress the pill when a saved cut is loaded — that result wasn't
  // packed in this session, so attributing the live timer to it would
  // be misleading.
  const showPackTimer = hasPackMeasurement && !hasFrozenLayouts

  // PR 7 — pack state for the auto-nest visualizer. Decision tree:
  //   1. packError              → "error" (with Retry)
  //   2. isPackingState         → "loading" when there's nothing renderable
  //   3. no renderable layouts  → "empty"
  //   4. otherwise              → "ready" (render the actual layout)
  //
  // `activeLayouts` is the right signal because it already accounts
  // for both `showLive` (auto-boost suppresses partial first-round
  // results) and frozen layouts. Using raw `hasLiveLayouts` would
  // fall through to "ready" during auto-boost — the first round has
  // returned a partial result but the renderer should still be showing
  // the loading panel until the second round resolves.
  const hasRenderableLayouts = activeLayouts !== null && activeLayouts.length > 0
  const packState: "empty" | "loading" | "error" | "ready" = packError
    ? "error"
    : isPackingState && !hasRenderableLayouts
      ? "loading"
      : !hasRenderableLayouts
        ? "empty"
        : "ready"

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
      packState={packState}
      packError={packError ?? undefined}
      onRetryPack={onRetryPack}
      // PR 7 — when an error replaces the canvas, the downstream
      // components (CutLegend, useSheetSelection, thumbnail strip)
      // must not see stale layouts. `useSheetSelection` already
      // clears stale ids when its `layouts` input no longer contains
      // them; passing `undefined` here triggers that cleanup so the
      // drawer doesn't keep a selection that points at a now-invisible
      // sheet. The strip is already gated on `packState === "ready"`,
      // so this is additional defense-in-depth.
      layouts={packState === "error" ? undefined : (activeLayouts ?? undefined)}
      debugOverlays={debugOverlays}
      packDurationMs={packDurationMs}
      isPackLive={isPackLive}
      hasPackMeasurement={showPackTimer}
    />
  )
}

// Tracks the duration of the current (or most recent) pack flow.
// `active` spans the entire multi-round auto-boost loop, not just a
// single Rust call, so a pack that takes two rounds reads as one
// continuous measurement (the gap between rounds is microseconds and
// shouldn't reset the timer).
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
