"use client"
/* eslint-disable react-hooks/set-state-in-effect */
// React 19's `set-state-in-effect` rule fires on the SVG-level
// keyboard / pointer handlers below where we lift roving-focus and
// drag-vs-click state out of the SVG event lifecycle. The setters
// are deliberately invariant-driven (we set state from a derived
// condition, not a render value), so the rule's "this could be
// derived state" intent does not apply.

import React from "react"
import NestingShapeRenderer from "./nesting-shape-renderer"
import {
  SimpleModeCanvasDefs,
  SimpleModeOffcutLabels,
  SimpleModeDimensionLabels,
} from "./nesting-viz-simple-parts"
import type { DebugOverlayOptions, PreviewItem, SheetPreview } from "./nesting-visualizer-types"
import type { SimpleModeLayout } from "./nesting-viz-simple-layout"
import { formatInches } from "./nesting-viz-simple-layout"
import type { LayoutModel, PlacedPart } from "./layout-model"

const IS_DEV = process.env.NODE_ENV === "development"

// Phase 5 PR 3 (Treatment 1) — see globals.css `--svg-*` tokens for
// the palette. PR 4 adds the interactive part layer on top.
const SHEET_FILL = "var(--svg-sheet-base)"
const PAGE_FILL = "var(--svg-page-bg)"
const OFFCUT_OUTLINE = "var(--svg-offcut-border)"
const OFFCUT_DASH = "6 4"
const OFFCUT_OUTLINE_WIDTH = 1.75
const SHEET_BEVEL_LIGHT = "var(--svg-bevel-highlight)"
const SHEET_BEVEL_SHADE = "var(--svg-bevel-shadow)"

// Pixel threshold separating "pan" from "click" on the SVG when the
// view is zoomed in. Anything under this is treated as a part-pick;
// over this engages drag-pan. Tuned to match shadcn's drag-vs-click
// convention.
const DRAG_CLICK_THRESHOLD_PX = 5

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

interface SheetSvgProps {
  sheet: SheetPreview
  layout: SimpleModeLayout
  previewRollW: number
  previewRollL: number
  isMultiSheet: boolean
  totalSheets: number
  /**
   * The matching `LayoutModel` for this sheet, when available. Source
   * of `debugScrapRects` for the dev-only "Show inscribed scrap rects"
   * overlay; also the source of `PlacedPart.id` used as the stable
   * selection key.
   */
  layoutModel?: LayoutModel
  debugOverlays?: DebugOverlayOptions
  selectedPartId: string | null
  onSelectPart: (partId: string | null) => void
}

// eslint-disable-next-line max-lines-per-function
export default function SheetSvg({
  sheet,
  layout,
  previewRollW,
  previewRollL,
  isMultiSheet,
  totalSheets,
  layoutModel,
  debugOverlays,
  selectedPartId,
  onSelectPart,
}: SheetSvgProps) {
  // Roving keyboard focus index within this sheet. Each sheet tracks
  // its own; visually only the focused index in the sheet the
  // operator is currently tabbing through shows a focus ring.
  const [focusedIndex, setFocusedIndex] = React.useState<number | null>(null)
  const onFocusIndex = React.useCallback((idx: number | null) => setFocusedIndex(idx), [])
  const sPat = sheet.sheetIndex > 0 ? `-s${sheet.sheetIndex}` : ""
  const sClip = `stock-clip-${layout.stockPatternId}${sPat}`
  const sVignette = `vignette-${layout.stockPatternId}${sPat}`
  const sToolGrid = `tool-grid-${layout.stockPatternId}${sPat}`
  const sScrapHatch = `scrap-hatch-${layout.wastePatternId}${sPat}`
  const sOffcutPinstripe = `offcut-pinstripe-${layout.stockPatternId}${sPat}`
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
    moved: boolean
  } | null>(null)
  // Survives the pointerup → click handoff. dragRef is cleared on
  // pointerup, which fires BEFORE click in the browser event loop —
  // without this stash, onSvgClick would always see `moved === undefined`
  // and proceed to select after a drag. Consume-once flag.
  const justDraggedRef = React.useRef(false)

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

  // Map a part-id to its `PlacedPart` for `id -> index` lookups during
  // keyboard navigation and click resolution.
  const partIdToIndex = React.useMemo(() => {
    const m = new Map<string, number>()
    layoutModel?.parts.forEach((p, i) => {
      if (p.id) m.set(p.id, i)
    })
    return m
  }, [layoutModel])

  // Wheel zoom centered on cursor position (reads panRef to avoid stale closure)
  React.useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
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

  const onPointerDown = React.useCallback((e: React.PointerEvent) => {
    // Always track pointerdown so we can decide pan-vs-click on
    // pointerup. Drag-pan only engages above the movement threshold.
    e.currentTarget.setPointerCapture(e.pointerId)
    const curPan = panRef.current
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: curPan.x,
      startPanY: curPan.y,
      moved: false,
    }
  }, [])
  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return
      const svg = svgRef.current
      if (!svg) return
      const curZoom = zoomRef.current
      const dx0 = e.clientX - dragRef.current.startX
      const dy0 = e.clientY - dragRef.current.startY
      // Below the threshold the pointer is still a click candidate;
      // skip the pan update so a small wobble doesn't move the view.
      if (
        !dragRef.current.moved &&
        Math.abs(dx0) < DRAG_CLICK_THRESHOLD_PX &&
        Math.abs(dy0) < DRAG_CLICK_THRESHOLD_PX
      ) {
        return
      }
      // Pan only engages once zoomed in; on zoom=1 the threshold is
      // exceeded but there's nothing to pan, so silently no-op.
      if (curZoom <= 1) {
        dragRef.current.moved = true
        return
      }
      dragRef.current.moved = true
      const rect = svg.getBoundingClientRect()
      const vbW = layout.viewWidth / curZoom
      const vbH = layout.viewHeight / curZoom
      const dx = (dx0 / rect.width) * vbW
      const dy = (dy0 / rect.height) * vbH
      setPan({
        x: Math.max(0, Math.min(dragRef.current.startPanX - dx, layout.viewWidth - vbW)),
        y: Math.max(0, Math.min(dragRef.current.startPanY - dy, layout.viewHeight - vbH)),
      })
    },
    [layout.viewWidth, layout.viewHeight]
  )
  const onPointerUp = React.useCallback((e: React.PointerEvent) => {
    // Only flip the click-suppression flag when the pointer actually
    // panned the view. At zoom = 1 there is nothing to pan, so a
    // pointerdown → 6px wobble → pointerup → click sequence is still
    // a part-pick, not a drag. Without this guard we'd swallow the
    // click and leave the operator wondering why their first attempt
    // to select didn't take.
    if (dragRef.current?.moved && zoomRef.current > 1) {
      justDraggedRef.current = true
    }
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragRef.current = null
  }, [])

  // Pointer left the SVG mid-drag: end the drag but DON'T flip
  // `justDraggedRef`. The browser doesn't fire `click` after a
  // pointerleave-outside-target, so setting the flag here would
  // swallow the next unrelated click. Symmetric `releasePointerCapture`
  // covers the case where the pointer left while still captured.
  const onSvgPointerLeave = React.useCallback((e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragRef.current = null
  }, [])

  // Single SVG-level click handler — event delegation rather than
  // per-`<g>` `onClick`. A target hit-tests via `data-part-id`; an
  // empty-sheet click deselects.
  const onSvgClick = React.useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Consume the post-drag click stash. Browser fires
      // `pointerup` → `click`; `dragRef` is nulled in `onPointerUp`,
      // so we mirror the moved-flag into `justDraggedRef` and clear
      // it here. Without this, a pan that ended over a part would
      // also select that part.
      if (justDraggedRef.current) {
        justDraggedRef.current = false
        return
      }
      const target = e.target as Element | null
      const partEl = target?.closest("[data-part-id]") as HTMLElement | SVGElement | null
      const id = partEl?.getAttribute("data-part-id")
      if (id) {
        onSelectPart(id)
        const idx = partIdToIndex.get(id)
        if (idx !== undefined) onFocusIndex(idx)
        return
      }
      // Clicked the sheet but not on a part — deselect.
      if (selectedPartId !== null) {
        onSelectPart(null)
        onFocusIndex(null)
      }
    },
    [onSelectPart, onFocusIndex, partIdToIndex, selectedPartId]
  )

  const focusPartAt = React.useCallback(
    (nextIndex: number) => {
      const part = layoutModel?.parts[nextIndex]
      if (!part) return
      onFocusIndex(nextIndex)
      const node = svgRef.current?.querySelector<SVGGElement>(
        `[data-part-id="${CSS.escape(part.id)}"]`
      )
      node?.focus()
    },
    [layoutModel, onFocusIndex]
  )

  const onSvgKeyDown = React.useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      const parts = layoutModel?.parts
      if (!parts || parts.length === 0) return

      // Activate the focused part. Resolve target part in priority:
      //   1. roving `focusedIndex` (operator has arrow-keyed here)
      //   2. `document.activeElement.closest('[data-part-id]')` — covers
      //      the case where Tab landed directly on a `<g>` without
      //      ever passing through the arrow-key navigation
      if (e.key === "Enter" || e.key === " ") {
        let idx: number | null = focusedIndex
        if (idx == null && typeof document !== "undefined") {
          const active = document.activeElement
          const partEl = active?.closest("[data-part-id]") as Element | null
          const id = partEl?.getAttribute("data-part-id")
          if (id) {
            const resolved = partIdToIndex.get(id)
            if (resolved !== undefined) idx = resolved
          }
        }
        if (idx == null) return
        const part = parts[idx]
        if (part?.id) {
          e.preventDefault()
          onSelectPart(part.id === selectedPartId ? null : part.id)
        }
        return
      }
      // Escape clears selection (drawer also handles this for its own focus).
      if (e.key === "Escape") {
        if (selectedPartId !== null) {
          e.preventDefault()
          onSelectPart(null)
        }
        return
      }
      // Arrow-key roving navigation. Operator metaphor: arrows shift
      // through the placement order, not 2D geometry.
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        const next = focusedIndex == null ? 0 : Math.min(parts.length - 1, focusedIndex + 1)
        focusPartAt(next)
        return
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        const next = focusedIndex == null ? 0 : Math.max(0, focusedIndex - 1)
        focusPartAt(next)
        return
      }
    },
    [layoutModel, focusedIndex, selectedPartId, onSelectPart, focusPartAt, partIdToIndex]
  )

  const resetZoom = React.useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  // Tab into a part `<g>` syncs `focusedIndex` so the dashed focus
  // overlay paints under whichever `<g>` actually holds DOM focus —
  // not only the parts the operator reached via arrow keys.
  // Resolved via event delegation at the `<svg>` capture phase.
  const onSvgFocusCapture = React.useCallback(
    (e: React.FocusEvent<SVGSVGElement>) => {
      const target = e.target as Element | null
      const partEl = target?.closest("[data-part-id]") as Element | null
      const id = partEl?.getAttribute("data-part-id")
      if (!id) return
      const idx = partIdToIndex.get(id)
      if (idx !== undefined && idx !== focusedIndex) {
        onFocusIndex(idx)
      }
    },
    [partIdToIndex, focusedIndex, onFocusIndex]
  )

  // Clear `focusedIndex` only when focus leaves the SVG entirely
  // (relatedTarget is outside or null). Moving focus between part
  // `<g>` elements inside this SVG keeps the index — the
  // `onFocusCapture` above already updates to the new target.
  const onSvgBlurCapture = React.useCallback(
    (e: React.FocusEvent<SVGSVGElement>) => {
      const next = e.relatedTarget as Node | null
      if (!next || !e.currentTarget.contains(next)) {
        onFocusIndex(null)
      }
    },
    [onFocusIndex]
  )

  const vbW = layout.viewWidth / zoom
  const vbH = layout.viewHeight / zoom

  const sheetTransform = layout.displayRotated
    ? `translate(${layout.effSurfaceX} ${layout.effSurfaceY + layout.effSurfacePxH}) ` +
      `rotate(-90) scale(${layout.effScale / layout.scale}) ` +
      `translate(${-layout.surfaceX} ${-layout.surfaceY})`
    : undefined

  // Per-part roving tabindex + aria-label. Multi-sheet flow: only
  // ONE sheet across the canvas can hold the rover at any time —
  // otherwise multiple sheets would each declare a `tabIndex=0` part,
  // which is ambiguous focus for the operator. Resolution order:
  //   1. local arrow-key focus (`focusedIndex`) — operator is
  //      actively navigating this sheet
  //   2. this sheet owns the global selection — keep the rover on
  //      the selected part so Tab returns to it
  //   3. nothing selected, this is sheet 0 — declare the entry point
  //      as part 0
  //   4. otherwise — no rover; all parts on this sheet are `tabIndex=-1`
  const partsCount = layoutModel?.parts.length ?? 0
  const sheetOwnsSelection = selectedPartId !== null && partIdToIndex.has(selectedPartId)
  const isPrimaryEntrySheet = selectedPartId === null && sheet.sheetIndex === 0
  const rovingIndex: number | null =
    focusedIndex !== null
      ? focusedIndex
      : sheetOwnsSelection
        ? (partIdToIndex.get(selectedPartId) ?? null)
        : isPrimaryEntrySheet && partsCount > 0
          ? 0
          : null

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
        onPointerLeave={onSvgPointerLeave}
        onClick={onSvgClick}
        onKeyDown={onSvgKeyDown}
        onFocusCapture={onSvgFocusCapture}
        onBlurCapture={onSvgBlurCapture}
        // `tabIndex={-1}` keeps the SVG itself out of the tab order;
        // individual parts carry their own roving tabindex.
        tabIndex={-1}
      >
        <SimpleModeCanvasDefs
          sheetVignetteId={sVignette}
          toolGridPatternId={sToolGrid}
          scrapHatchPatternId={sScrapHatch}
          offcutPinstripePatternId={sOffcutPinstripe}
          pageGridPatternId={sPageGrid}
          markerId={sMarker}
        />
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
          {`Typical ${formatInches(previewRollW)}" × ${formatInches(previewRollL)}" stock sheet`}
        </text>
        <clipPath id={sClip}>
          <rect
            x={layout.effSurfaceX}
            y={layout.effSurfaceY}
            width={layout.effSurfacePxW}
            height={layout.effSurfacePxH}
          />
        </clipPath>
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
                    fill={`url(#${sOffcutPinstripe})`}
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
                    fill={`url(#${sOffcutPinstripe})`}
                    stroke={OFFCUT_OUTLINE}
                    strokeWidth={OFFCUT_OUTLINE_WIDTH}
                    strokeDasharray={OFFCUT_DASH}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              )}
            {IS_DEV && (
              <SheetDebugOverlays
                sheet={sheet}
                layout={layout}
                layoutModel={layoutModel}
                debugOverlays={debugOverlays}
              />
            )}
            {sheet.preview.items.map((item, index) => {
              const part: PlacedPart | undefined = layoutModel?.parts[index]
              const partId = part?.id
              const isSelected = partId !== undefined && partId === selectedPartId
              const isFocused = index === focusedIndex
              const tabIndex = rovingIndex !== null && index === rovingIndex ? 0 : -1
              const ariaLabel = part ? buildPartAriaLabel(part, index, partsCount) : undefined
              return (
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
                  partId={partId}
                  isSelected={isSelected}
                  isFocused={isFocused}
                  tabIndex={tabIndex}
                  ariaLabel={ariaLabel}
                />
              )
            })}
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

// Spoken via aria-label and the parent's aria-live region. Reads
// well in NVDA / VoiceOver: "Part A, 12 by 18 inches, placement 3
// of 24". Inches deliberately spelled out ("by", "inches") since
// screen readers stumble on the `×` glyph and `"` quote mark.
function buildPartAriaLabel(part: PlacedPart, index: number, total: number): string {
  const w = formatInches(part.width)
  const h = formatInches(part.height)
  return `Part ${part.label}, ${w} by ${h} inches, placement ${index + 1} of ${total}`
}
