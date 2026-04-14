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
  PreviewItem,
  SimpleCutMetrics,
} from "./nesting-visualizer-types"

import { getStrategies, scoreStrat } from "./nesting-layout-utils"

import {
  generateSimplePartPreview,
  generateMultiPartPreview,
  computeMultiSheetPreviews,
  globalMultiSheetPack,
} from "./nesting-shape-previews"
import { buildPartPreviewItem, computeFabricationScore } from "./nesting-preview-builders"

import { drawMiniRoll, drawDetailStep } from "./nesting-svg-renderers"

import { renderNonRectBg } from "./nesting-viz-nonrect-render"
import { useNfpOptimizer } from "./use-nfp-optimizer"
import NestingVizSimpleMode from "./nesting-viz-simple-mode"
import NestingVizRectPanel from "./nesting-viz-rect-panel"
import NestingVizControls from "./nesting-viz-controls"

// ── 90° CW rotation utilities ───────────────────────────────────────────────

function rotateItem90CW<T extends { x: number; y: number; width: number; height: number }>(
  item: T,
  rollL: number
): T {
  return {
    ...item,
    x: rollL - item.y - item.height,
    y: item.x,
    width: item.height,
    height: item.width,
  }
}

function rotatePreviewItem(item: PreviewItem, rollL: number): PreviewItem {
  const rotatePt = (pt: { x: number; y: number }) => ({ x: rollL - pt.y, y: pt.x })
  // Existing NFP polygon — rotate vertices only
  if (item.placedPolygon && item.placedPolygon.length > 0) {
    return { ...rotateItem90CW(item, rollL), placedPolygon: item.placedPolygon.map(rotatePt) }
  }
  // Trapezoid — tessellate 4 corners then rotate
  if (item.renderShape === "trapezoid") {
    const topW = item.topWidth ?? item.width
    const botW = item.bottomWidth ?? item.width
    const pts = item.flipped
      ? [
          { x: item.x + (item.width - botW) / 2, y: item.y },
          { x: item.x + (item.width + botW) / 2, y: item.y },
          { x: item.x + (item.width + topW) / 2, y: item.y + item.height },
          { x: item.x + (item.width - topW) / 2, y: item.y + item.height },
        ]
      : [
          { x: item.x + (item.width - topW) / 2, y: item.y },
          { x: item.x + (item.width + topW) / 2, y: item.y },
          { x: item.x + (item.width + botW) / 2, y: item.y + item.height },
          { x: item.x + (item.width - botW) / 2, y: item.y + item.height },
        ]
    return { ...rotateItem90CW(item, rollL), placedPolygon: pts.map(rotatePt) }
  }
  // Sector (cone) — tessellate arcs then rotate
  if (item.renderShape === "sector") {
    const innerR = item.innerRadius ?? 0
    const outerR = item.outerRadius ?? 0
    const arcDeg = item.arcDegrees ?? 120
    const halfArc = (arcDeg * Math.PI) / 360
    const flipSign = item.flipped ? -1 : 1
    const arcAngleOffset = item.rotated90 ? Math.PI / 2 : 0
    // Rotated 90° CW: dome points right → apex at right edge, center = right_edge − outerR
    const cx = item.rotated90 ? item.x + item.width - outerR : item.x + item.width / 2
    const cy = item.rotated90 ? item.y + item.height / 2 : item.y + outerR
    const a1 = -Math.PI / 2 - halfArc * flipSign + arcAngleOffset
    const a2 = -Math.PI / 2 + halfArc * flipSign + arcAngleOffset
    const segments = 32
    const pts: Array<{ x: number; y: number }> = []
    for (let i = 0; i <= segments; i++) {
      const a = a1 + (i / segments) * (a2 - a1)
      pts.push({ x: cx + outerR * Math.cos(a), y: cy + outerR * Math.sin(a) })
    }
    for (let i = 0; i <= segments; i++) {
      const a = a2 + (i / segments) * (a1 - a2)
      pts.push({ x: cx + innerR * Math.cos(a), y: cy + innerR * Math.sin(a) })
    }
    return { ...rotateItem90CW(item, rollL), placedPolygon: pts.map(rotatePt) }
  }
  return rotateItem90CW(item, rollL)
}

function rotateSimplePartPreview(preview: SimplePartPreview, rollL: number): SimplePartPreview {
  const rotBand = (b: { x: number; y: number; width: number; height: number }) =>
    rotateItem90CW(b, rollL)
  return {
    ...preview,
    items: preview.items.map((item) => rotatePreviewItem(item, rollL)),
    offcutBands: preview.offcutBands.map(rotBand),
    scrapBands: preview.scrapBands.map(rotBand),
  }
}

function rotateMultiSheetResult(result: MultiSheetResult, rollL: number): MultiSheetResult {
  return {
    ...result,
    sheets: result.sheets.map((sheet) => ({
      ...sheet,
      preview: rotateSimplePartPreview(sheet.preview, rollL),
    })),
  }
}

// ────────────────────────────────────────────────────────────────────────────

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

  const allTrapezoids =
    specs.length > 1 && specs.every((s) => s.partType === "trapezoid")
  const shouldUseGlobalPacker =
    (specs.length > 1 && !allTrapezoids) ||
    (specs.length === 1 && specs[0]?.partType === "rectangle" && basePreview.overflowUnits > 0)

  if (shouldUseGlobalPacker) {
    return globalMultiSheetPack(specs, rollW, rollL, 4, cutW, cutH)
  }

  if (allTrapezoids) {
    const regenerate = (_qty: number, remainingSpecs?: typeof specs) =>
      generateMultiPartPreview(rollW, rollL, remainingSpecs ?? specs, cutW, cutH)
    return computeMultiSheetPreviews(basePreview, rollW, rollL, 4, regenerate, specs)
  }

  // Single-part: use existing sequential overflow packing
  const regenerate = (qty: number) => {
    const partWithQty = { ...specs[0], quantity: qty }
    return generateSimplePartPreview(rollW, rollL, partWithQty, cutW, cutH, qty)
  }
  return computeMultiSheetPreviews(basePreview, rollW, rollL, 4, regenerate)
}

function indexToTag(i: number): string {
  let tag = ""
  let n = i
  do {
    tag = String.fromCharCode(65 + (n % 26)) + tag
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return tag
}

function buildTagMap(
  basePreview: SimplePartPreview | null,
  multiSheet: MultiSheetResult | null,
  specOrderedLabels?: string[]
) {
  if (!basePreview) return new Map<string, string>()
  // Collect all unique item labels that actually appear in the layout.
  const itemLabels: string[] = []
  const addItem = (label: string) => {
    if (!itemLabels.includes(label)) itemLabels.push(label)
  }
  if (multiSheet) {
    multiSheet.sheets.forEach((sheet) => sheet.preview.items.forEach((item) => addItem(item.label)))
  } else {
    basePreview.items.forEach((item) => addItem(item.label))
  }
  // Order by spec selection so tags match the user's A/B/C… checkboxes.
  // Only include spec labels that actually appear in items — spec labels that
  // don't match any item (e.g. full-circumference label for a split cylinder)
  // are skipped so no phantom legend entry is created.
  const allLabels: string[] = []
  if (specOrderedLabels) {
    for (const specLabel of specOrderedLabels) {
      if (itemLabels.includes(specLabel) && !allLabels.includes(specLabel)) {
        allLabels.push(specLabel)
      }
    }
  }
  for (const label of itemLabels) {
    if (!allLabels.includes(label)) allLabels.push(label)
  }
  return new Map(allLabels.map((label, i) => [label, indexToTag(i)]))
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
  onMetricsChange,
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

  // Calls useNfpOptimizer to attempt to optimize the UI for long running generations
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

  const tagMap = useMemo(() => {
    const specLabels = activeSimpleSpecs.map(
      (spec) => buildPartPreviewItem(spec, defaultCutWidth, defaultCutHeight).label
    )
    return buildTagMap(baseSimplePreview, multiSheet, specLabels)
  }, [baseSimplePreview, multiSheet, activeSimpleSpecs, defaultCutWidth, defaultCutHeight])

  useEffect(() => {
    if (!simpleMode || !onMetricsChange || !baseSimplePreview) return
    try {
      let metrics: SimpleCutMetrics
      if (multiSheet && multiSheet.sheets.length > 1) {
        const totalPieces = multiSheet.sheets.reduce(
          (sum, s) => sum + s.preview.piecesShown,
          0
        )
        metrics = {
          partsCompleted: multiSheet.totalUnitsCompleted,
          cutPieces: totalPieces,
          materialUsedSqFt: multiSheet.totalUsedArea / 144,
          reusableOffsetSqFt: multiSheet.totalReusableArea / 144,
          scrapSqFt: multiSheet.totalScrapArea / 144,
          fabScore: multiSheet.avgFabScore / 100,
        }
      } else {
        const rawScore =
          baseSimplePreview.fabricationScore ??
          computeFabricationScore(baseSimplePreview, defaultRollWidth, defaultRollLength).score
        metrics = {
          partsCompleted: baseSimplePreview.unitsCompleted,
          cutPieces: baseSimplePreview.piecesShown,
          materialUsedSqFt: baseSimplePreview.usedArea / 144,
          reusableOffsetSqFt: baseSimplePreview.reusableArea / 144,
          scrapSqFt: baseSimplePreview.scrapArea / 144,
          fabScore: rawScore / 100,
        }
      }
      onMetricsChange(metrics)
    } catch (_error) {
      // metrics computation failure must not break the visualizer
    }
  }, [simpleMode, baseSimplePreview, multiSheet, onMetricsChange])

  // Rotate the entire result once after nesting so the display layer never needs to transform.
  const shouldRotate = defaultRollLength > defaultRollWidth

  const rotatedMultiSheet = useMemo(
    () =>
      shouldRotate && multiSheet
        ? rotateMultiSheetResult(multiSheet, defaultRollLength)
        : multiSheet,
    [shouldRotate, multiSheet, defaultRollLength]
  )

  const rotatedOptimizedItems = useMemo(
    () =>
      shouldRotate && optimizedItems
        ? optimizedItems.map((item) => rotatePreviewItem(item, defaultRollLength))
        : optimizedItems,
    [shouldRotate, optimizedItems, defaultRollLength]
  )

  if (simpleMode) {
    const rawPreview =
      baseSimplePreview ??
      generateSimplePartPreview(
        defaultRollWidth,
        defaultRollLength,
        activeSimpleSpecs[0],
        defaultCutWidth,
        defaultCutHeight,
        defaultQty
      )

    const preview = shouldRotate
      ? rotateSimplePartPreview(rawPreview, defaultRollLength)
      : rawPreview

    return (
      <NestingVizSimpleMode
        preview={preview}
        previewRollW={shouldRotate ? defaultRollLength : defaultRollWidth}
        previewRollL={shouldRotate ? defaultRollWidth : defaultRollLength}
        wasRotated={shouldRotate}
        patternSeed={patternSeed}
        viewMode={viewMode}
        optimizedResult={optimizedResult}
        optimizedItems={rotatedOptimizedItems}
        isOptimizing={isOptimizing}
        nfpError={nfpError}
        multiSheet={rotatedMultiSheet}
        tagMap={tagMap}
      />
    )
  }

  /* 
    This return will never be executed because simpleMode evaluates to true always.
    Claude:
      simpleMode is always true when the component is rendered from the cut planner page. 
      The false default only applies if someone renders <NestingVisualizer /> without the prop — 
      which never happens anywhere in the current codebase.
  */

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

/* eslint-disable max-lines */
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
