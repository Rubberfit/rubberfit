"use client"

import React, { useState, useRef, useEffect, useCallback, useId, useMemo } from "react"
import { Scissors } from "lucide-react"

// Re-export types needed by external consumers
export type { SimplePartType, SimpleCutDirection } from "./nesting-visualizer-types"

import type {
  ShapeType,
  GrainDir,
  DiagDir,
  ScoredStrategy,
  NestingVisualizerProps,
  SimplePartPreview,
  MultiSheetResult,
} from "./nesting-visualizer-types"

import { getStrategies, scoreStrat } from "./nesting-layout-utils"

import {
  generateSimplePartPreview,
  generateMultiPartPreview,
  computeMultiSheetPreviews,
  globalMultiSheetPack,
} from "./nesting-shape-previews"

import { drawMiniRoll, drawDetailStep } from "./nesting-svg-renderers"

import { renderNonRectBg } from "./nesting-viz-nonrect-render"
import { useNfpOptimizer } from "./use-nfp-optimizer"
import NestingVizSimpleMode from "./nesting-viz-simple-mode"
import NestingVizRectPanel from "./nesting-viz-rect-panel"
import NestingVizControls from "./nesting-viz-controls"

function buildMultiSheet(
  simpleMode: boolean,
  basePreview: SimplePartPreview | null,
  specs: NestingVisualizerProps["simpleParts"] & object,
  rollW: number,
  rollL: number,
  cutW: number,
  cutH: number
): MultiSheetResult | null {
  if (!simpleMode || !basePreview) return null
  const shouldUseGlobalPacker =
    specs.length > 1 ||
    (specs.length === 1 && specs[0]?.partType === "rectangle" && basePreview.overflowUnits > 0)

  // A single uploaded template can still represent many identical parts.
  // Route overflowing rectangle jobs through the global packer as well.
  if (shouldUseGlobalPacker) {
    return globalMultiSheetPack(specs, rollW, rollL, 4, cutW, cutH)
  }

  // Single-part: use existing sequential overflow packing
  const regenerate = (qty: number) => {
    const partWithQty = { ...specs[0], quantity: qty }
    return generateSimplePartPreview(rollW, rollL, partWithQty, cutW, cutH, qty)
  }
  return computeMultiSheetPreviews(basePreview, rollW, rollL, 4, regenerate)
}

function buildTagMap(basePreview: SimplePartPreview | null, multiSheet: MultiSheetResult | null) {
  if (!basePreview) return new Map<string, string>()
  // Collect labels from ALL sheets so overflow items get tags too
  const allLabels: string[] = []
  if (multiSheet) {
    multiSheet.sheets.forEach((sheet) => {
      sheet.preview.items.forEach((item) => {
        if (!allLabels.includes(item.label)) allLabels.push(item.label)
      })
    })
  } else {
    basePreview.items.forEach((item) => {
      if (!allLabels.includes(item.label)) allLabels.push(item.label)
    })
  }
  return new Map(allLabels.map((label, i) => [label, String.fromCharCode(65 + i)]))
}

// eslint-disable-next-line max-lines-per-function
export default function NestingVisualizer({
  defaultRollWidth = 48,
  defaultRollLength = 96,
  defaultCutWidth = 24,
  defaultCutHeight = 12,
  defaultQty = 6,
  simpleMode = false,
  simplePart,
  simpleParts,
}: NestingVisualizerProps) {
  const patternSeed = useId().replace(/:/g, "")

  // shared
  const [shape, setShape] = useState<ShapeType>("rect")
  const [rollW, setRollW] = useState(defaultRollWidth)
  const [rollL, setRollL] = useState(defaultRollLength)
  // rect mode
  const [cutW, setCutW] = useState(defaultCutWidth)
  const [cutH, setCutH] = useState(defaultCutHeight)
  const [qty, setQty] = useState(defaultQty)
  const [diagAng, setDiagAng] = useState(45)
  const [ddir, setDdir] = useState<DiagDir>("ltr")
  const [grain, setGrain] = useState<GrainDir>("none")
  const [activeId, setActiveId] = useState<string>("")
  const [activeStep, setActiveStep] = useState(0)
  const [scored, setScored] = useState<ScoredStrategy[]>([])
  const [diam, setDiam] = useState(12)
  const [innerR, setInnerR] = useState(10)
  const [outerR, setOuterR] = useState(24)
  const [arcDeg, setArcDeg] = useState(120)
  const [bgStats, setBgStats] = useState({ count: 0, used: 0, waste: 100 })
  const [viewMode, setViewMode] = useState<"stock" | "profile">("stock")

  const activeSimpleSpecs = useMemo(() => {
    if (simpleParts && simpleParts.length > 0) return simpleParts
    if (simplePart) return [simplePart]
    return [
      {
        partType: "rectangle" as const,
        quantity: defaultQty,
        width: defaultCutWidth,
        length: defaultCutHeight,
      },
    ]
  }, [simpleParts, simplePart, defaultQty, defaultCutWidth, defaultCutHeight])

  const baseSimplePreview = useMemo<SimplePartPreview | null>(() => {
    if (!simpleMode) return null
    return activeSimpleSpecs.length > 1
      ? generateMultiPartPreview(
          defaultRollWidth,
          defaultRollLength,
          activeSimpleSpecs,
          defaultCutWidth,
          defaultCutHeight
        )
      : generateSimplePartPreview(
          defaultRollWidth,
          defaultRollLength,
          activeSimpleSpecs[0],
          defaultCutWidth,
          defaultCutHeight,
          defaultQty
        )
  }, [
    simpleMode,
    activeSimpleSpecs,
    defaultRollWidth,
    defaultRollLength,
    defaultCutWidth,
    defaultCutHeight,
    defaultQty,
  ])

  useEffect(() => {
    if (!simpleMode) return
    if (activeSimpleSpecs.some((spec) => spec.partType !== "rectangle"))
      queueMicrotask(() => setViewMode("stock"))
  }, [simpleMode, activeSimpleSpecs])

  const bgSvgRef = useRef<SVGSVGElement>(null)
  const detailRef = useRef<SVGSVGElement>(null)
  const miniRefs = useRef<Record<string, SVGSVGElement>>({})

  useEffect(() => {
    if (simpleMode || shape !== "rect") return
    const strats = getStrategies(cutW, cutH, diagAng, ddir)
    const results = strats.map((s) => scoreStrat(s, rollW, rollL, qty, grain))
    results.sort((a, b) => b.score - a.score)
    queueMicrotask(() => {
      setScored(results)
      if (!activeId || !results.find((r) => r.id === activeId)) {
        setActiveId(results[0]?.id ?? "")
        setActiveStep(0)
      }
    })
  }, [simpleMode, shape, rollW, rollL, cutW, cutH, qty, diagAng, ddir, grain, activeId])

  useEffect(() => {
    if (simpleMode || shape !== "rect") return
    scored.forEach((s) => {
      const svg = miniRefs.current[s.id]
      if (svg) drawMiniRoll(svg, s, rollW, rollL, grain)
    })
  }, [simpleMode, scored, shape, grain, rollW, rollL])

  useEffect(() => {
    if (simpleMode || shape !== "rect") return
    const active = scored.find((s) => s.id === activeId)
    if (!active || !detailRef.current) return
    drawDetailStep(detailRef.current, active, rollW, rollL, activeStep)
  }, [simpleMode, scored, activeId, activeStep, shape, rollW, rollL])

  const renderBg = useCallback(() => {
    const svg = bgSvgRef.current
    if (simpleMode || !svg || shape === "rect") return
    setBgStats(renderNonRectBg(svg, shape, rollW, rollL, diam, innerR, outerR, arcDeg))
  }, [arcDeg, diam, innerR, outerR, rollL, rollW, shape, simpleMode])

  useEffect(() => {
    renderBg()
  }, [renderBg])

  const activeStrat = scored.find((s) => s.id === activeId)
  const stepNote = computeStepNote(activeStrat, activeStep, rollW, rollL, qty)

  const { optimizedResult, optimizedItems, isOptimizing, nfpError } = useNfpOptimizer(
    simpleMode,
    activeSimpleSpecs,
    defaultCutWidth,
    defaultCutHeight,
    defaultQty,
    defaultRollWidth,
    defaultRollLength
  )

  const multiSheet = useMemo(
    () =>
      buildMultiSheet(
        simpleMode,
        baseSimplePreview,
        activeSimpleSpecs,
        defaultRollWidth,
        defaultRollLength,
        defaultCutWidth,
        defaultCutHeight
      ),
    [
      simpleMode,
      baseSimplePreview,
      activeSimpleSpecs,
      defaultRollWidth,
      defaultRollLength,
      defaultCutWidth,
      defaultCutHeight,
    ]
  )

  const tagMap = useMemo(
    () => buildTagMap(baseSimplePreview, multiSheet),
    [baseSimplePreview, multiSheet]
  )

  if (simpleMode) {
    const preview =
      baseSimplePreview ??
      generateSimplePartPreview(
        defaultRollWidth,
        defaultRollLength,
        activeSimpleSpecs[0],
        defaultCutWidth,
        defaultCutHeight,
        defaultQty
      )
    return (
      <NestingVizSimpleMode
        preview={preview}
        previewRollW={defaultRollWidth}
        previewRollL={defaultRollLength}
        patternSeed={patternSeed}
        viewMode={viewMode}
        optimizedResult={optimizedResult}
        optimizedItems={optimizedItems}
        isOptimizing={isOptimizing}
        nfpError={nfpError}
        multiSheet={multiSheet}
        tagMap={tagMap}
      />
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <NestingVizHeader />
      <NestingVizControls
        shape={shape}
        rollW={rollW}
        rollL={rollL}
        cutW={cutW}
        cutH={cutH}
        qty={qty}
        diagAng={diagAng}
        grain={grain}
        ddir={ddir}
        diam={diam}
        innerR={innerR}
        outerR={outerR}
        arcDeg={arcDeg}
        setShape={setShape}
        setRollW={setRollW}
        setRollL={setRollL}
        setCutW={setCutW}
        setCutH={setCutH}
        setQty={setQty}
        setDiagAng={setDiagAng}
        setGrain={setGrain}
        setDdir={setDdir}
        setDiam={setDiam}
        setInnerR={setInnerR}
        setOuterR={setOuterR}
        setArcDeg={setArcDeg}
        setActiveStep={setActiveStep}
      />
      {shape === "rect" && (
        <NestingVizRectPanel
          scored={scored}
          activeId={activeId}
          activeStep={activeStep}
          activeStrat={activeStrat}
          stepNote={stepNote}
          qty={qty}
          detailRef={detailRef}
          miniRefs={miniRefs}
          setActiveId={setActiveId}
          setActiveStep={setActiveStep}
        />
      )}
      {shape !== "rect" && <NonRectStatsPanel bgSvgRef={bgSvgRef} bgStats={bgStats} />}
    </div>
  )
}

function NestingVizHeader() {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40">
      <div className="flex items-center gap-2">
        <Scissors className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground tracking-wide">
          Nesting Layout &amp; Cut Strategy
        </span>
      </div>
      <div className="flex gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500/30 border border-green-500" />
          usable
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-400/20 border border-blue-400" />
          tri-B
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-400/20 border border-dashed border-red-400" />
          scrap
        </span>
      </div>
    </div>
  )
}

function NonRectStatsPanel({
  bgSvgRef,
  bgStats,
}: {
  bgSvgRef: React.RefObject<SVGSVGElement | null>
  bgStats: { count: number; used: number; waste: number }
}) {
  return (
    <>
      <div className="px-3 pt-2 pb-1">
        <svg
          ref={bgSvgRef}
          width="100%"
          viewBox="0 0 680 310"
          style={{ display: "block", borderRadius: "6px", background: "#0f172a" }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        {[
          { label: "Pieces", val: String(bgStats.count), good: true },
          { label: "Material Used", val: `${bgStats.used.toFixed(1)}%`, good: true },
          { label: "Scrap / Waste", val: `${bgStats.waste.toFixed(1)}%`, good: false },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg bg-muted/40 border border-border text-center px-3 py-2.5"
          >
            <div className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
              {s.label}
            </div>
            <div
              className="text-xl font-bold"
              style={{
                color: s.good ? "var(--color-text-success)" : "var(--color-text-danger)",
              }}
            >
              {s.val}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function computeStepNote(
  activeStrat: ScoredStrategy | undefined,
  activeStep: number,
  rollW: number,
  rollL: number,
  qty: number
): string {
  if (!activeStrat) return ""
  const cur = activeStrat.steps[activeStep]
  const diagAn =
    activeStrat.diagType === "corner"
      ? (Math.atan2(activeStrat.cutH, activeStrat.cutW) * 180) / Math.PI
      : (activeStrat.diagAngle ?? 45)
  const map: Record<string, string> = {
    "Full roll": `Roll is ${rollW}"\u00D7${rollL}". ${activeStrat.cols} cols \u00D7 ${activeStrat.rows} rows = ${activeStrat.method === "diag" ? activeStrat.rects * 2 + " triangles" : activeStrat.rects + " rectangles"} of ${activeStrat.cutW}"\u00D7${activeStrat.cutH}".`,
    "H-cuts first": `Make ${activeStrat.hCuts} horizontal cut${activeStrat.hCuts !== 1 ? "s" : ""} every ${activeStrat.cutH}" \u2014 runs \u2190\u2192 across roll width. This is the primary cut direction.`,
    "V-cuts next": `Make ${activeStrat.vCuts} vertical cut${activeStrat.vCuts !== 1 ? "s" : ""} every ${activeStrat.cutW}" \u2014 runs \u2195 down the roll.`,
    "V-cuts first": `Make ${activeStrat.vCuts} vertical cut${activeStrat.vCuts !== 1 ? "s" : ""} every ${activeStrat.cutW}" \u2014 runs \u2195 down roll length. This is the primary cut direction.`,
    "H-cuts next": `Make ${activeStrat.hCuts} horizontal cut${activeStrat.hCuts !== 1 ? "s" : ""} every ${activeStrat.cutH}" \u2014 runs \u2190\u2192 across the roll width.`,
    "Straight cuts": `${activeStrat.hCuts} horizontal + ${activeStrat.vCuts} vertical cuts to create ${activeStrat.rects} rectangles before the diagonal.`,
    "Diagonal cuts": `Diagonal cut each rectangle ${activeStrat.ddir === "ltr" ? "\u2571 left-to-right" : "\u2572 right-to-left"} at ${diagAn.toFixed(1)}\u00B0. Yields triangle A (green) + B (blue) \u2014 both kept.`,
    Done: `All cuts done. ${activeStrat.pieces} pieces ready.${activeStrat.pieces < qty ? " Note: second roll needed." : ""}`,
  }
  return map[cur] ?? ""
}
