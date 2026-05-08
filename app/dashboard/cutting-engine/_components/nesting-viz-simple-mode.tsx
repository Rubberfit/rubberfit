// Simple mode render for NestingVisualizer — sub-components in nesting-viz-simple-parts.tsx

import React from "react"
import type {
  DebugOverlayOptions,
  PreviewItem,
  MultiSheetResult,
  SheetPreview,
} from "./nesting-visualizer-types"
import type { NestingResult } from "@/nesting/types"
import NestingShapeRenderer from "./nesting-shape-renderer"
import {
  SimpleModeHeader,
  SimpleModeCanvasDefs,
  SimpleModeMetrics,
  SimpleModeFooter,
  SimpleModeCutPlan,
  SimpleModeOffcutLabels,
  SimpleModeDimensionLabels,
} from "./nesting-viz-simple-parts"
import { SimpleModeAdhesives } from "./nesting-viz-adhesives"
import { computeSimpleModeLayout, formatInches } from "./nesting-viz-simple-layout"
import { computeFabricationScore } from "./nesting-preview-builders"
import type { SimplePartPreview } from "./nesting-visualizer-types"
import type { SimpleModeLayout } from "./nesting-viz-simple-layout"
import type { LayoutModel } from "./layout-model"
import { CutLegend } from "./cut-legend"

const IS_DEV = process.env.NODE_ENV === "development"

// Phase 5 PR 3 (Treatment 1 — Precision Nesting / Industrial CAD).
//
// Every colour below pulls from a `--svg-*` CSS variable defined in
// `globals.css` (`:root` for light, `.dark` for the "shop floor at
// night" inversion). The SVG defs and presentation attributes
// reference these via `var(...)`, so the visualizer stays a single
// self-contained render tree that simply inherits the theme from
// `<html class="dark">`. No React branching, no duplicated defs.
//
// Sheet base is the warm amber-ash photographic-rubber tone in light
// and stone-900 deep warm plane in dark; depth comes from a multiply-
// blended radial vignette (dark vignette in light mode, white halo
// in dark mode), a faint dot-grid tooling overlay (black dots light
// / white dots dark), and a 1px inner bevel (top-left highlight,
// bottom-right shade — both invert in dark). Scrap regions get the
// red-on-pink hatch in light, red-on-near-black hatch in dark.
// Offcut regions punch through the scrap with a clean cream fill in
// light and a stone-800 reserved-mask in dark; both carry a dashed
// boundary so the shape reads as a discrete reusable chunk.
const SHEET_FILL = "var(--svg-sheet-base)"
const PAGE_FILL = "var(--svg-page-bg)"
const OFFCUT_FILL = "var(--svg-offcut-fill)"
const OFFCUT_OUTLINE = "var(--svg-offcut-border)"
const OFFCUT_DASH = "6 4"
const OFFCUT_OUTLINE_WIDTH = 1.75
const SHEET_BEVEL_LIGHT = "var(--svg-bevel-highlight)"
const SHEET_BEVEL_SHADE = "var(--svg-bevel-shadow)"

// Single-pass min/max bounding box for an SVG render item. Used by the
// dev-only "Show AABB" overlay. Falls back to the placement's
// `x/y/width/height` when no rotated polygon is present (plain rects
// where Rust skipped polygon materialisation).
function itemAabb(item: PreviewItem): { x: number; y: number; width: number; height: number } {
  if (item.placedPolygon && item.placedPolygon.length >= 3) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const pt of item.placedPolygon) {
      if (pt.x < minX) minX = pt.x
      if (pt.y < minY) minY = pt.y
      if (pt.x > maxX) maxX = pt.x
      if (pt.y > maxY) maxY = pt.y
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }
  return { x: item.x, y: item.y, width: item.width, height: item.height }
}

// Dev-only debug overlays painted between the offcut/scrap fills and
// the parts pass. Hoisted out of `SheetSvg` so the `IS_DEV && ...`
// guard at the call site stays a single short-circuit (DCE-friendly)
// without growing `SheetSvg`'s cyclomatic complexity. Returns `null`
// when neither overlay is requested so React skips the whole subtree.
function SheetDebugOverlays({
  sheet,
  layout,
  layoutModel,
  debugOverlays,
}: {
  sheet: SheetPreview
  layout: SimpleModeLayout
  layoutModel?: LayoutModel
  debugOverlays?: DebugOverlayOptions
}) {
  const showScrap = debugOverlays?.showScrapRects === true
  const showAabb = debugOverlays?.showAabb === true
  if (!showScrap && !showAabb) return null

  return (
    <>
      {showScrap &&
        layoutModel?.debugScrapRects?.map((region, i) => (
          <rect
            key={`debug-scrap-${i}`}
            x={layout.surfaceX + region.x * layout.scale}
            y={layout.surfaceY + region.y * layout.scale}
            width={region.width * layout.scale}
            height={region.height * layout.scale}
            fill="none"
            stroke="rgba(153, 27, 27, 0.85)"
            strokeWidth={1.25}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "none" }}
          />
        ))}
      {showAabb && (
        <>
          {sheet.preview.offcutBands.map((band, i) => (
            <rect
              key={`debug-aabb-offcut-${i}`}
              x={layout.surfaceX + band.x * layout.scale}
              y={layout.surfaceY + band.y * layout.scale}
              width={band.width * layout.scale}
              height={band.height * layout.scale}
              fill="none"
              stroke="rgba(16, 185, 129, 0.95)"
              strokeWidth={1.0}
              strokeDasharray="6 3"
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: "none" }}
            />
          ))}
          {sheet.preview.items.map((item, i) => {
            const aabb = itemAabb(item)
            return (
              <rect
                key={`debug-aabb-part-${i}`}
                x={layout.surfaceX + aabb.x * layout.scale}
                y={layout.surfaceY + aabb.y * layout.scale}
                width={aabb.width * layout.scale}
                height={aabb.height * layout.scale}
                fill="none"
                stroke="rgba(124, 58, 237, 0.95)"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "none" }}
              />
            )
          })}
        </>
      )}
    </>
  )
}

interface SimpleModeProps {
  preview: SimplePartPreview
  previewRollW: number
  previewRollL: number
  patternSeed: string
  viewMode: "stock" | "profile"
  optimizedResult: NestingResult | null
  optimizedItems: PreviewItem[] | null
  isOptimizing: boolean
  nfpError: string | null
  multiSheet?: MultiSheetResult | null
  /**
   * Source-of-truth `LayoutModel[]` from the Rust pack pipeline. Drives
   * the `CutLegend` (tag → dimension-label table) so the descriptor is
   * the part's actual dimensions rather than a tag-as-self lookup.
   */
  layouts?: LayoutModel[]
  /**
   * Dev-only diagnostic overlays. Both default off and the renderer
   * gates the actual paint on `IS_DEV` so production bundles ship no
   * overlay code.
   */
  debugOverlays?: DebugOverlayOptions
  /** Duration of the current (or most recent) Rust pack call, in ms. */
  packDurationMs?: number
  /** True while a Rust pack call is in flight — drives the spinner on the pill. */
  isPackLive?: boolean
  /** False before any pack has run — hides the pill on a fresh session. */
  hasPackMeasurement?: boolean
}

// eslint-disable-next-line max-lines-per-function
function SheetSvg({
  sheet,
  layout,
  preview,
  previewRollW,
  previewRollL,
  isMultiSheet,
  totalSheets,
  layoutModel,
  debugOverlays,
}: {
  sheet: SheetPreview
  layout: SimpleModeLayout
  preview: SimplePartPreview
  previewRollW: number
  previewRollL: number
  isMultiSheet: boolean
  totalSheets: number
  /**
   * The matching `LayoutModel` for this sheet, when available. Source
   * of `debugScrapRects` for the dev-only "Show inscribed scrap rects"
   * overlay; otherwise unused for rendering.
   */
  layoutModel?: LayoutModel
  debugOverlays?: DebugOverlayOptions
}) {
  // Per-sheet ids for the Treatment 1 SVG defs. The legacy
  // `stockPatternId` / `offcutPatternId` / `wastePatternId` /
  // `usablePatternId` stems on the layout object stay as namespacing
  // strings; we hang the new defs off them so multi-sheet layouts
  // don't collide on `<defs>` ids. Names are historical, values
  // inside the defs are the Industrial CAD palette.
  const sPat = sheet.sheetIndex > 0 ? `-s${sheet.sheetIndex}` : ""
  const sClip = `stock-clip-${layout.stockPatternId}${sPat}`
  const sVignette = `vignette-${layout.stockPatternId}${sPat}`
  const sToolGrid = `tool-grid-${layout.stockPatternId}${sPat}`
  const sScrapHatch = `scrap-hatch-${layout.wastePatternId}${sPat}`
  const sPageGrid = `page-grid-${layout.stockPatternId}${sPat}`
  const sMarker = `${layout.markerId}${sPat}`

  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const svgRef = React.useRef<SVGSVGElement>(null)
  const panRef = React.useRef(pan)
  const zoomRef = React.useRef(zoom)
  const dragRef = React.useRef<{
    startX: number
    startY: number
    startPanX: number
    startPanY: number
  } | null>(null)

  React.useLayoutEffect(() => {
    panRef.current = pan
    zoomRef.current = zoom
  }, [pan, zoom])

  const clampPan = React.useCallback(
    (px: number, py: number, z: number) => ({
      x: Math.max(0, Math.min(px, layout.viewWidth - layout.viewWidth / z)),
      y: Math.max(0, Math.min(py, layout.viewHeight - layout.viewHeight / z)),
    }),
    [layout.viewWidth, layout.viewHeight]
  )

  // Wheel zoom centered on cursor position (reads panRef to avoid stale closure)
  React.useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      // Delta-proportional zoom: smooth on trackpads and mouse wheels
      const zoomSpeed = 0.003
      setZoom((prevZoom) => {
        const raw = prevZoom * Math.pow(2, -e.deltaY * zoomSpeed)
        const newZoom = Math.min(8, Math.max(1, raw))
        if (newZoom === prevZoom) return prevZoom
        const curPan = panRef.current
        const rect = svg.getBoundingClientRect()
        const vbW = layout.viewWidth / prevZoom
        const vbH = layout.viewHeight / prevZoom
        const fracX = (e.clientX - rect.left) / rect.width
        const fracY = (e.clientY - rect.top) / rect.height
        const svgX = curPan.x + fracX * vbW
        const svgY = curPan.y + fracY * vbH
        const newVbW = layout.viewWidth / newZoom
        const newVbH = layout.viewHeight / newZoom
        const newPanX = svgX - fracX * newVbW
        const newPanY = svgY - fracY * newVbH
        setPan({
          x: Math.max(0, Math.min(newPanX, layout.viewWidth - newVbW)),
          y: Math.max(0, Math.min(newPanY, layout.viewHeight - newVbH)),
        })
        return newZoom
      })
    }
    svg.addEventListener("wheel", handler, { passive: false })
    return () => svg.removeEventListener("wheel", handler)
  }, [layout.viewWidth, layout.viewHeight])

  // Drag-to-pan (reads refs to avoid stale closures)
  const onPointerDown = React.useCallback((e: React.PointerEvent) => {
    if (zoomRef.current <= 1) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const curPan = panRef.current
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: curPan.x,
      startPanY: curPan.y,
    }
  }, [])
  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return
      const svg = svgRef.current
      if (!svg) return
      const curZoom = zoomRef.current
      const rect = svg.getBoundingClientRect()
      const vbW = layout.viewWidth / curZoom
      const vbH = layout.viewHeight / curZoom
      const dx = ((e.clientX - dragRef.current.startX) / rect.width) * vbW
      const dy = ((e.clientY - dragRef.current.startY) / rect.height) * vbH
      setPan({
        x: Math.max(0, Math.min(dragRef.current.startPanX - dx, layout.viewWidth - vbW)),
        y: Math.max(0, Math.min(dragRef.current.startPanY - dy, layout.viewHeight - vbH)),
      })
    },
    [layout.viewWidth, layout.viewHeight]
  )
  const onPointerUp = React.useCallback(() => {
    dragRef.current = null
  }, [])

  const resetZoom = React.useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const vbW = layout.viewWidth / zoom
  const vbH = layout.viewHeight / zoom

  // Display rotation transform (right-to-left in SVG): undo portrait
  // surface origin → scale up to landscape pixel-density → rotate
  // -90° (puts the original LEFT edge at the new BOTTOM) → translate
  // to the rotated surface's bottom-left. When displayRotated is
  // false, sheetTransform is undefined so the inner `<g>` is a no-op.
  const sheetTransform = layout.displayRotated
    ? `translate(${layout.effSurfaceX} ${layout.effSurfaceY + layout.effSurfacePxH}) ` +
      `rotate(-90) scale(${layout.effScale / layout.scale}) ` +
      `translate(${-layout.surfaceX} ${-layout.surfaceY})`
    : undefined

  return (
    <div className="group relative">
      {/* Zoom controls — visible on hover */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-border/60 bg-background/90 px-2 py-1 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => {
            setZoom((z) => {
              const nz = Math.max(1, +(z * 0.67).toFixed(2))
              setPan((p) => (nz === 1 ? { x: 0, y: 0 } : clampPan(p.x, p.y, nz)))
              return nz
            })
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-foreground hover:bg-muted"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="min-w-[3ch] text-center text-[10px] font-medium text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(8, +(z * 1.5).toFixed(2)))}
          className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-foreground hover:bg-muted"
          aria-label="Zoom in"
        >
          +
        </button>
        {zoom !== 1 && (
          <button
            type="button"
            onClick={resetZoom}
            className="ml-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
          >
            Reset
          </button>
        )}
      </div>

      {isMultiSheet && (
        <div className="mb-1 text-center text-xs font-medium text-muted-foreground">
          Sheet {sheet.sheetIndex + 1} of {totalSheets}
          {sheet.isPartial ? " (partial)" : ""}
        </div>
      )}

      <svg
        ref={svgRef}
        data-sheet-svg={sheet.sheetIndex}
        viewBox={`${pan.x} ${pan.y} ${vbW} ${vbH}`}
        className="mx-auto block w-full max-w-6xl rounded-xl"
        style={{ cursor: zoom > 1 ? "grab" : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <SimpleModeCanvasDefs
          sheetVignetteId={sVignette}
          toolGridPatternId={sToolGrid}
          scrapHatchPatternId={sScrapHatch}
          pageGridPatternId={sPageGrid}
          markerId={sMarker}
        />
        {/* Page backdrop — slate base + 40px graph-grid evokes the
            cutting mat / CMM table operators work on. Painted as the
            first SVG element so everything else stacks on top. */}
        <rect x={pan.x} y={pan.y} width={vbW} height={vbH} fill={PAGE_FILL} />
        <rect x={pan.x} y={pan.y} width={vbW} height={vbH} fill={`url(#${sPageGrid})`} />
        <text
          x={layout.viewWidth / 2}
          y="34"
          textAnchor="middle"
          className="fill-foreground"
          fontSize={20 / zoom}
          fontWeight="700"
        >
          {"Rubber Sheet Nesting Layout"}
        </text>
        <text
          x={layout.viewWidth / 2}
          y="60"
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={12 / zoom}
        >
          {`Typical ${formatInches(previewRollW)}" \u00D7 ${formatInches(previewRollL)}" stock sheet`}
        </text>
        {/* Clip everything to stock boundary */}
        <clipPath id={sClip}>
          <rect
            x={layout.effSurfaceX}
            y={layout.effSurfaceY}
            width={layout.effSurfacePxW}
            height={layout.effSurfacePxH}
          />
        </clipPath>
        {/* Sheet — Treatment 1 stack:
              1. solid amber-ash base
              2. dot-grid tooling overlay
              3. radial vignette (multiply blend) for overhead-light
                 falloff
              4. inner-bevel highlight + shade strokes for edge rolloff
            All four layers are clipped to the same rect so the
            stacking lines up. Outer border stays neutral so the sheet
            still reads as a discrete object against the page grid. */}
        <rect
          x={layout.effSurfaceX}
          y={layout.effSurfaceY}
          width={layout.effSurfacePxW}
          height={layout.effSurfacePxH}
          fill={SHEET_FILL}
          stroke="#475569"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x={layout.effSurfaceX}
          y={layout.effSurfaceY}
          width={layout.effSurfacePxW}
          height={layout.effSurfacePxH}
          fill={`url(#${sToolGrid})`}
          pointerEvents="none"
        />
        <rect
          x={layout.effSurfaceX}
          y={layout.effSurfaceY}
          width={layout.effSurfacePxW}
          height={layout.effSurfacePxH}
          fill={`url(#${sVignette})`}
          style={{ mixBlendMode: "multiply" }}
          pointerEvents="none"
        />
        <line
          x1={layout.effSurfaceX}
          y1={layout.effSurfaceY}
          x2={layout.effSurfaceX + layout.effSurfacePxW}
          y2={layout.effSurfaceY}
          stroke={SHEET_BEVEL_LIGHT}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <line
          x1={layout.effSurfaceX}
          y1={layout.effSurfaceY}
          x2={layout.effSurfaceX}
          y2={layout.effSurfaceY + layout.effSurfacePxH}
          stroke={SHEET_BEVEL_LIGHT}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <line
          x1={layout.effSurfaceX + layout.effSurfacePxW}
          y1={layout.effSurfaceY}
          x2={layout.effSurfaceX + layout.effSurfacePxW}
          y2={layout.effSurfaceY + layout.effSurfacePxH}
          stroke={SHEET_BEVEL_SHADE}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <line
          x1={layout.effSurfaceX}
          y1={layout.effSurfaceY + layout.effSurfacePxH}
          x2={layout.effSurfaceX + layout.effSurfacePxW}
          y2={layout.effSurfaceY + layout.effSurfacePxH}
          stroke={SHEET_BEVEL_SHADE}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <g clipPath={`url(#${sClip})`}>
          <g transform={sheetTransform}>
            {/* Scrap bands — rust hatch (engineering "marked for waste"
                notation, not a screaming red void). */}
            {!layout.shapeFirstView &&
              sheet.preview.scrapBands.map((band, index) =>
                band.polygon ? (
                  <polygon
                    key={`scrap-band-${index + 1}`}
                    points={band.polygon
                      .map(
                        (pt) =>
                          `${layout.surfaceX + pt.x * layout.scale},${layout.surfaceY + pt.y * layout.scale}`
                      )
                      .join(" ")}
                    fill={`url(#${sScrapHatch})`}
                  />
                ) : (
                  <rect
                    key={`scrap-band-${index + 1}`}
                    x={layout.surfaceX + band.x * layout.scale}
                    y={layout.surfaceY + band.y * layout.scale}
                    width={band.width * layout.scale}
                    height={band.height * layout.scale}
                    fill={`url(#${sScrapHatch})`}
                  />
                )
              )}
            {/* Offcut bands — clean cream fill that punches through
                any underlying scrap hatch, plus a dashed boundary so
                each reusable region reads as a discrete chunk an
                operator could harvest. Painted AFTER scrap so the
                fill wins overlap (Rust often classifies the entire
                un-occupied bin as scrap, with offcut bands carved out
                by a separate pass). */}
            {!layout.shapeFirstView &&
              sheet.preview.offcutBands.map((band, index) =>
                band.polygon ? (
                  <polygon
                    key={`offcut-band-${index + 1}`}
                    points={band.polygon
                      .map(
                        (pt) =>
                          `${layout.surfaceX + pt.x * layout.scale},${layout.surfaceY + pt.y * layout.scale}`
                      )
                      .join(" ")}
                    fill={OFFCUT_FILL}
                    stroke={OFFCUT_OUTLINE}
                    strokeWidth={OFFCUT_OUTLINE_WIDTH}
                    strokeDasharray={OFFCUT_DASH}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : (
                  <rect
                    key={`offcut-band-${index + 1}`}
                    x={layout.surfaceX + band.x * layout.scale}
                    y={layout.surfaceY + band.y * layout.scale}
                    width={band.width * layout.scale}
                    height={band.height * layout.scale}
                    fill={OFFCUT_FILL}
                    stroke={OFFCUT_OUTLINE}
                    strokeWidth={OFFCUT_OUTLINE_WIDTH}
                    strokeDasharray={OFFCUT_DASH}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              )}
            {/* Dev-only debug overlays. `IS_DEV` is a build-time constant
              (Next.js inlines `process.env.NODE_ENV === "development"`),
              so SWC dead-code-eliminates this whole branch — and
              tree-shakes the unreferenced `SheetDebugOverlays` /
              `itemAabb` helpers — in production bundles. */}
            {IS_DEV && (
              <SheetDebugOverlays
                sheet={sheet}
                layout={layout}
                layoutModel={layoutModel}
                debugOverlays={debugOverlays}
              />
            )}
            {/* Phase 5 PR 3 collapsed the prior background+foreground
                two-pass render. The "background" pass only existed to
                paint the stone-900 + wastePattern bbox crutch under
                circle / sector / trapezoid shapes; that crutch is gone
                now, so a single pass over the items is enough. */}
            {sheet.preview.items.map((item, index) => (
              <NestingShapeRenderer
                key={`shape-${index}`}
                item={item}
                index={index}
                surfaceX={layout.surfaceX}
                surfaceY={layout.surfaceY}
                unitOriginX={layout.unitOriginX}
                unitOriginY={layout.unitOriginY}
                scale={layout.scale}
                tagLetter={item.label}
                zoom={zoom}
                displayRotated={layout.displayRotated}
              />
            ))}
          </g>
        </g>
        <g transform={sheetTransform}>
          <SimpleModeOffcutLabels
            offcutLabelBands={
              !layout.shapeFirstView && sheet.preview.offcutBands.length > 0
                ? [...sheet.preview.offcutBands]
                    .sort((a, b) => b.width * b.height - a.width * a.height)
                    .reduce<typeof sheet.preview.offcutBands>((kept, band) => {
                      const pw = band.width * layout.scale
                      const ph = band.height * layout.scale
                      if (Math.min(pw * 0.12, ph * 0.25) < 1.5) return kept
                      const cx = band.x + band.width / 2
                      const cy = band.y + band.height / 2
                      const overlaps = kept.some(
                        (k) => cx >= k.x && cx <= k.x + k.width && cy >= k.y && cy <= k.y + k.height
                      )
                      if (overlaps) return kept
                      const BAND_DIMENSION_TOLERANCE = 0.5
                      const sameDims = kept.some(
                        (k) =>
                          Math.abs(k.width - band.width) < BAND_DIMENSION_TOLERANCE &&
                          Math.abs(k.height - band.height) < BAND_DIMENSION_TOLERANCE
                      )
                      if (sameDims) return kept
                      kept.push(band)
                      return kept
                    }, [])
                : []
            }
            surfaceX={layout.surfaceX}
            surfaceY={layout.surfaceY}
            scale={layout.scale}
            displayRotated={layout.displayRotated}
            zoom={zoom}
          />
        </g>
        <SimpleModeDimensionLabels layout={layout} zoom={zoom} markerId={sMarker} />
      </svg>
    </div>
  )
}

export default function NestingVizSimpleMode({
  preview,
  previewRollW,
  previewRollL,
  patternSeed,
  viewMode,
  optimizedResult,
  optimizedItems,
  isOptimizing,
  nfpError,
  multiSheet,
  layouts,
  debugOverlays,
  packDurationMs,
  isPackLive,
  hasPackMeasurement,
}: SimpleModeProps) {
  const layout = React.useMemo(
    () =>
      computeSimpleModeLayout({
        preview,
        previewRollW,
        previewRollL,
        patternSeed,
        viewMode,
        optimizedResult,
        optimizedItems,
      }),
    [preview, previewRollW, previewRollL, patternSeed, viewMode, optimizedResult, optimizedItems]
  )

  const isMultiSheet = (multiSheet?.sheets.length ?? 0) > 1
  // When multiSheet exists with 1 sheet, use its gap-filled preview for metrics
  // instead of the base layout.displayPreview (which lacks gap-filled items).
  const metricsPreview =
    multiSheet && multiSheet.sheets.length === 1
      ? multiSheet.sheets[0].preview
      : layout.displayPreview
  const metricsUsedSqFt = metricsPreview.usedArea / 144
  const metricsReusableSqFt = metricsPreview.reusableArea / 144
  const metricsScrapSqFt = metricsPreview.scrapArea / 144
  const metricsFabScore =
    metricsPreview !== layout.displayPreview
      ? computeFabricationScore(metricsPreview, previewRollW, previewRollL)
      : layout.fabScore
  const sheets = multiSheet?.sheets ?? [
    { sheetIndex: 0, preview: layout.displayPreview, isPartial: false },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <SimpleModeHeader
        previewTitle={layout.previewTitle}
        layoutNote={layout.layoutNote}
        displayPreview={metricsPreview}
        pieceCountLabel={layout.pieceCountLabel}
        pieceCountValue={`${metricsPreview.piecesShown}`}
        reusableOffcutSqFt={metricsReusableSqFt}
        reusableOffcutPct={
          layout.stockSqFt > 0 ? (metricsReusableSqFt / layout.stockSqFt) * 100 : 0
        }
        reusableMetricLabel={layout.reusableMetricLabel}
        scrapMetricLabel={layout.scrapMetricLabel}
        scrapPct={layout.stockSqFt > 0 ? (metricsScrapSqFt / layout.stockSqFt) * 100 : 0}
        isSplitStockPreview={layout.isSplitStockPreview}
        missingCutPieceCount={Math.max(
          0,
          metricsPreview.requestedUnits - metricsPreview.piecesShown
        )}
        isOptimizedResult={layout.isOptimizedResult}
        isOptimizing={isOptimizing}
        nfpError={nfpError}
        multiSheet={multiSheet}
        packDurationMs={packDurationMs}
        isPackLive={isPackLive}
        hasPackMeasurement={hasPackMeasurement}
      />

      {layouts && layouts.length > 0 && <CutLegend layouts={layouts} />}

      <div
        className={`bg-card px-2 py-4 sm:px-4 ${isMultiSheet ? "flex flex-col gap-6 md:grid-cols-2" : "overflow-x-auto"}`}
      >
        {sheets.map((sheet) => (
          <SheetSvg
            key={`sheet-${sheet.sheetIndex}`}
            sheet={sheet}
            layout={layout}
            preview={preview}
            previewRollW={previewRollW}
            previewRollL={previewRollL}
            isMultiSheet={isMultiSheet}
            totalSheets={sheets.length}
            layoutModel={layouts?.[sheet.sheetIndex]}
            debugOverlays={debugOverlays}
          />
        ))}
      </div>

      <SimpleModeMetrics
        displayPreview={metricsPreview}
        usedSqFt={metricsUsedSqFt}
        reusableOffcutSqFt={metricsReusableSqFt}
        scrapSqFt={metricsScrapSqFt}
        reusableMetricLabel={layout.reusableMetricLabel}
        pieceCountLabel={layout.pieceCountLabel}
        pieceCountValue={`${metricsPreview.piecesShown}`}
        fabScore={metricsFabScore}
        multiSheet={multiSheet}
      />

      <SimpleModeAdhesives
        usedSqFt={isMultiSheet && multiSheet ? multiSheet.totalUsedArea / 144 : metricsUsedSqFt}
      />

      <SimpleModeFooter
        metricsAreEstimatedFromStock={layout.metricsAreEstimatedFromStock}
        stockSqFt={layout.stockSqFt}
        displayPreview={metricsPreview}
        isSplitStockPreview={layout.isSplitStockPreview}
        missingCutPieceCount={Math.max(
          0,
          metricsPreview.requestedUnits - metricsPreview.piecesShown
        )}
        multiSheet={multiSheet}
      />

      {layout.showCutPlan && <SimpleModeCutPlan displayPreview={layout.displayPreview} />}
    </div>
  )
}
