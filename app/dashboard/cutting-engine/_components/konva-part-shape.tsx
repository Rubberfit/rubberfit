"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KonvaEventObject } from "konva/lib/Node"
import type { Group as KonvaGroupNode } from "konva/lib/Group"
import type { Context as KonvaContext } from "konva/lib/Context"
import type { Shape as KonvaShapeNode } from "konva/lib/Shape"
import { Circle, Ellipse, Group, Line, Rect, Ring, Shape, Text } from "react-konva"

import type { PlacedPart } from "./layout-model"
import type { KonvaThemeTokens } from "./konva-theme"
import { polygonCentroid } from "./part-label"

/**
 * Callback when a draggable part finishes moving. Coordinates are
 * in SHEET INCHES (not pixels) so callers don't need to know the
 * canvas scale. Only fires when `draggable` is enabled.
 */
export type PartDragEnd = (partId: string, xIn: number, yIn: number) => void

/**
 * Callback fired continuously during drag. Coordinates are in SHEET
 * INCHES. Callers should throttle downstream work (e.g. via rAF) —
 * this fires at pointer-move rate.
 */
export type PartDragMove = (partId: string, xIn: number, yIn: number) => void

/** Callback when a part is clicked. Fires before any drag. */
export type PartClick = (partId: string) => void

interface PartShapeProps {
  part: PlacedPart
  scale: number
  fill: string
  theme: KonvaThemeTokens
  /**
   * Mirrors `useKonvaTheme().isDark`. Drives the per-state shadow
   * opacity — dark mode needs higher opacity for the lift to read
   * over the stone-900 sheet.
   */
  isDark: boolean
  isDraggable: boolean
  isSelected: boolean
  onDragEnd?: PartDragEnd
  onDragMove?: PartDragMove
  onClick?: PartClick
}

/**
 * Memoized so stationary parts skip React reconciliation during a
 * drag of one of their siblings (issue #117 phase 3). `isDragging`
 * and `isHovered` live INSIDE this component so toggling them only
 * invalidates the affected instance — sibling memos stay intact and
 * dense scenes (~200 parts) don't re-render on every pointer move.
 *
 * Phase 5 PR 2: elevation is interaction chrome, not surface identity.
 * The `realistic` prop is gone; parts are flat at rest and only lift
 * when hovered, selected, or dragged. Visual values (shadow tiers,
 * 2px corner radius, teal selection stroke) come from Kimi K2.6's
 * design verdict and live on `KonvaThemeTokens`.
 */
const PartShape = memo(function PartShape({
  part,
  scale,
  fill,
  theme,
  isDark,
  isDraggable,
  isSelected,
  onDragEnd,
  onDragMove,
  onClick,
}: PartShapeProps) {
  const groupRef = useRef<KonvaGroupNode | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const pw = part.width * scale
  const ph = part.height * scale
  const rotationDeg = (part.rotationRad * 180) / Math.PI

  // Outer Group pivots around the part's CENTER so rotation pivots
  // there too. On drag end, `e.target.x()` is the new pivot (= center)
  // in world pixels; subtract the offset to get the top-left back.
  const handleDragStart = useCallback(() => {
    setIsDragging(true)
  }, [])

  const handleDragEnd = useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      setIsDragging(false)
      if (!onDragEnd) return
      onDragEnd(part.id, (e.target.x() - pw / 2) / scale, (e.target.y() - ph / 2) / scale)
    },
    [onDragEnd, part.id, pw, ph, scale]
  )

  const handleDragMove = useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      if (!onDragMove) return
      onDragMove(part.id, (e.target.x() - pw / 2) / scale, (e.target.y() - ph / 2) / scale)
    },
    [onDragMove, part.id, pw, ph, scale]
  )

  // mousedown (not click) so selection feedback is instant — Konva's
  // synthetic click waits to disambiguate from drag.
  const handleMouseDown = useCallback(() => {
    onClick?.(part.id)
  }, [onClick, part.id])

  const handleMouseEnter = useCallback(() => setIsHovered(true), [])
  const handleMouseLeave = useCallback(() => setIsHovered(false), [])

  // Hoist the elevated part to the top of its layer so the shadow
  // casts over neighbors instead of clipping beneath them. Skip
  // moveToTop on hover — z-index churn on every pointer-enter would
  // thrash the layer in dense scenes; selected/dragging are rare
  // enough that this is fine.
  //
  // The reorder is intentionally one-way: there is no inverse on
  // deselect, so the layer's child order accumulates a permutation
  // across the session. Visually invisible (parts are flat once
  // de-elevated) and Konva tolerates it; flagged so any future
  // feature that introspects `layer.children` order (z-export,
  // snapshot diff) knows it's history-dependent. `moveToTop()` is
  // idempotent so React 19 Strict Mode's mount → cleanup → mount
  // double-invoke is benign.
  useEffect(() => {
    if ((isSelected || isDragging) && groupRef.current) {
      groupRef.current.moveToTop()
    }
  }, [isSelected, isDragging])

  // ── Elevation chrome ────────────────────────────────────────────
  // Three tiers, decided by interaction state. Hierarchy:
  //   dragging  > selected (rest)  > hovered  > flat
  // Color comes from `theme.elevationShadow`; opacity (and blur,
  // offset) is per-tier. Flat is the default — most parts most of
  // the time.
  const isElevated = isSelected || isDragging || isHovered
  const shadowProps = isElevated
    ? buildShadowProps(theme.elevationShadow, isDark, isDragging, isSelected)
    : EMPTY_SHADOW

  // Selection stroke — phase 5 brand teal (`theme.selectedStroke`)
  // replaces the legacy hard-coded blue-500.
  const stroke = isSelected ? theme.selectedStroke : theme.partStroke
  const strokeWidth = isSelected ? 2 : 1

  // Hard 2px corner radius on the Rect fallback path — kills the
  // prior `min(pw, ph) * 0.03` math that made small parts bubble
  // and large parts blocky. Fixed value reads as a consistent
  // mechanical edge regardless of part size.
  const cornerRadius = 2

  // Dispatch order:
  //   1. Konva native primitives when the shape has one (Circle,
  //      Ellipse, Ring) — exact geometry, crisp hit-testing, no
  //      polygon-approximation artifacts.
  //   2. Polygon-as-Line (closed) for any shape that carries a
  //      precomputed vertex array (trapezoid, sector, triangle,
  //      n-gon, star, custom polygon).
  //   3. Axis-aligned Rect as last-resort fallback so a broken
  //      template still renders something at the right bbox.
  let body: React.ReactNode
  if (part.renderShape === "circle" && part.diameter != null) {
    const r = (part.diameter / 2) * scale
    body = (
      <Circle
        x={pw / 2}
        y={ph / 2}
        radius={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        {...shadowProps}
      />
    )
  } else if (part.renderShape === "ellipse") {
    body = (
      <Ellipse
        x={pw / 2}
        y={ph / 2}
        radiusX={pw / 2}
        radiusY={ph / 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        {...shadowProps}
      />
    )
  } else if (part.renderShape === "ring" && part.innerRadius != null && part.outerRadius != null) {
    body = (
      <Ring
        x={pw / 2}
        y={ph / 2}
        innerRadius={part.innerRadius * scale}
        outerRadius={part.outerRadius * scale}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        {...shadowProps}
      />
    )
  } else if (part.polygon && part.polygon.length >= 3) {
    const validHoles = (part.holes ?? []).filter((h) => h.length >= 3)
    if (validHoles.length > 0) {
      // Compound path render: outer ring + N hole loops painted via
      // `ctx.fill("evenodd")` so holes become true transparent cutouts.
      // Per Kimi K2.6 visual verdict (2026-05-15):
      //   - same 1px stroke on outer AND every hole boundary (every
      //     line is a cut; lighter strokes make holes read as
      //     decorative rather than subtractive)
      //   - selection teal stroke applies to outer ONLY (one teal
      //     ring keeps focus; stroking each hole adds visual noise)
      //   - hit area excludes holes via even-odd hitFunc so a click
      //     in the bore passes through instead of selecting the part
      body = (
        <CompoundPolygonShape
          outer={part.polygon}
          holes={validHoles}
          partX={part.x}
          partY={part.y}
          scale={scale}
          fill={fill}
          // Hole boundaries always get the neutral part stroke — the
          // teal selection accent is reserved for the outer ring only
          // (Codex review P3 + Kimi K2.6 verdict). When the part is
          // selected, `stroke` upstream resolves to selectedStroke;
          // pass `partStroke` here so the compound-path stroke stays
          // neutral on the hole boundaries.
          stroke={theme.partStroke}
          selectedStroke={isSelected ? theme.selectedStroke : null}
          strokeWidth={1}
          shadowProps={shadowProps}
        />
      )
    } else {
      const points = part.polygon.flatMap((pt) => [(pt.x - part.x) * scale, (pt.y - part.y) * scale])
      body = (
        <Line
          points={points}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          {...shadowProps}
        />
      )
    }
  } else {
    body = (
      <Rect
        x={0}
        y={0}
        width={pw}
        height={ph}
        cornerRadius={cornerRadius}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        {...shadowProps}
      />
    )
  }

  const fontSize = Math.max(9, Math.min(14, Math.min(pw, ph) / 3))

  // Label anchor: bbox center by default; for hole-bearing parts the
  // bbox center can land in the bore (ring gaskets, full-face gaskets),
  // so shift to the outer-ring centroid per Kimi K2.6 verdict. The
  // delta is the shift FROM the default bbox-center anchor TO the
  // centroid, applied to the Text x/y below — not an absolute coord
  // (Codex review P2-2). Computed once per render via useMemo —
  // polygonCentroid is O(N) on a single closed loop.
  const labelOffset = useMemo(() => {
    if (!part.polygon || part.polygon.length < 3 || !part.holes || part.holes.length === 0) {
      return null
    }
    const c = polygonCentroid(part.polygon)
    // Centroid in part-local coords (offset from part.x/part.y), then
    // shift from bbox center (pw/2, ph/2) to centroid position.
    return {
      dx: (c.x - part.x) * scale - pw / 2,
      dy: (c.y - part.y) * scale - ph / 2,
    }
  }, [part.polygon, part.holes, part.x, part.y, pw, ph, scale])

  return (
    <Group
      ref={groupRef}
      x={part.x * scale + pw / 2}
      y={part.y * scale + ph / 2}
      offsetX={pw / 2}
      offsetY={ph / 2}
      rotation={rotationDeg}
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onMouseDown={handleMouseDown}
      onTap={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {body}
      <Text
        x={labelOffset ? labelOffset.dx : 0}
        y={(labelOffset ? labelOffset.dy : 0) + ph / 2 - fontSize}
        width={pw}
        height={fontSize * 2}
        text={part.label}
        fontSize={fontSize}
        fill={theme.labelFill}
        stroke={theme.labelStroke}
        strokeWidth={2}
        fillAfterStrokeEnabled
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </Group>
  )
})

interface ShadowProps {
  shadowColor?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowOpacity?: number
}

const EMPTY_SHADOW: ShadowProps = {}

function buildShadowProps(
  color: string,
  isDark: boolean,
  isDragging: boolean,
  isSelected: boolean
): ShadowProps {
  if (isDragging) {
    return {
      shadowColor: color,
      shadowBlur: 16,
      shadowOffsetX: 0,
      shadowOffsetY: 6,
      shadowOpacity: isDark ? 0.5 : 0.4,
    }
  }
  if (isSelected) {
    return {
      shadowColor: color,
      shadowBlur: 10,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      shadowOpacity: isDark ? 0.5 : 0.35,
    }
  }
  // Hover — the only remaining case when `isElevated` is true and
  // neither `isDragging` nor `selected` fires.
  return {
    shadowColor: color,
    shadowBlur: 6,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    shadowOpacity: 0.2,
  }
}

interface CompoundPolygonShapeProps {
  outer: ReadonlyArray<{ x: number; y: number }>
  holes: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>
  partX: number
  partY: number
  scale: number
  fill: string
  stroke: string
  /**
   * Non-null when the part is selected — drives the additional teal
   * outline traced on the outer ring only (Kimi K2.6 verdict — one
   * teal stroke per part, never per hole).
   */
  selectedStroke: string | null
  strokeWidth: number
  shadowProps: ShadowProps
}

/**
 * Konva renderer for a part with N inner holes. Paints the compound
 * path via the underlying canvas context's even-odd fill rule so
 * holes are true transparent cutouts (no fill leak through them, no
 * "two-overlapping-shapes" trick that breaks under shadows or hover).
 *
 * `sceneFunc` builds outer + each hole as subpaths, fills with
 * even-odd, then strokes the same compound path so each cut line
 * shows. `hitFunc` builds the same path and fills with the shape's
 * hit color under the even-odd rule, so a click inside a hole passes
 * through (clicks register on whatever lies behind, not the part).
 *
 * The outer-only selection stroke is drawn as a follow-up overlay
 * on the same shape — bypassing the compound path so only the outer
 * ring picks up the teal accent.
 */
function CompoundPolygonShape({
  outer,
  holes,
  partX,
  partY,
  scale,
  fill,
  stroke,
  selectedStroke,
  strokeWidth,
  shadowProps,
}: CompoundPolygonShapeProps) {
  const buildCompoundPath = (context: KonvaContext) => {
    context.beginPath()
    context.moveTo((outer[0].x - partX) * scale, (outer[0].y - partY) * scale)
    for (let i = 1; i < outer.length; i++) {
      context.lineTo((outer[i].x - partX) * scale, (outer[i].y - partY) * scale)
    }
    context.closePath()
    for (const hole of holes) {
      context.moveTo((hole[0].x - partX) * scale, (hole[0].y - partY) * scale)
      for (let i = 1; i < hole.length; i++) {
        context.lineTo((hole[i].x - partX) * scale, (hole[i].y - partY) * scale)
      }
      context.closePath()
    }
  }

  const buildOuterPath = (context: KonvaContext) => {
    context.beginPath()
    context.moveTo((outer[0].x - partX) * scale, (outer[0].y - partY) * scale)
    for (let i = 1; i < outer.length; i++) {
      context.lineTo((outer[i].x - partX) * scale, (outer[i].y - partY) * scale)
    }
    context.closePath()
  }

  const sceneFunc = (context: KonvaContext, _shape: KonvaShapeNode) => {
    // Compound fill + stroke under even-odd. Konva's `Context` wrapper
    // intentionally does NOT accept a fill-rule argument on `fill()`
    // (see Konva issues #422, #1117) — the documented escape hatch
    // for custom rendering inside a `sceneFunc` is to reach for
    // `context._context`, the underlying `CanvasRenderingContext2D`.
    // This is the same pattern Konva's own examples use for hatched
    // fills, gradient lookups, and any other Canvas2D API outside
    // Konva's wrapper surface.
    //
    // The reach is documented as part of Konva's public sceneFunc
    // contract; treating it as private state would force a heavier
    // workaround (offscreen canvas + Image fill via pattern) for a
    // single Canvas2D call. CodeRabbit flagged this as "hijacking
    // internals"; the alternative is materially worse for a small
    // feature. Pinned by the dispatch test in
    // tests/cutting-engine/polygon-with-holes-konva.test.tsx so a
    // future Konva upgrade that renames `_context` surfaces here.
    const raw = context._context
    buildCompoundPath(context)
    raw.fillStyle = fill
    raw.fill("evenodd")
    raw.strokeStyle = stroke
    raw.lineWidth = strokeWidth
    raw.stroke()
    // Selection accent — outer ring only.
    if (selectedStroke) {
      buildOuterPath(context)
      raw.strokeStyle = selectedStroke
      raw.lineWidth = 2
      raw.stroke()
    }
  }

  const hitFunc = (context: KonvaContext, shape: KonvaShapeNode) => {
    // Konva sets up the hit canvas's fillStyle/strokeStyle to the
    // shape's unique color key. We must read those AFTER Konva has
    // configured them — `colorKey` is the public API for the hit
    // color. Fill the compound path even-odd so the hole interiors
    // get NO hit color (transparent in the hit canvas → click-through).
    const raw = context._context
    buildCompoundPath(context)
    raw.fillStyle = shape.colorKey
    raw.fill("evenodd")
  }

  return <Shape sceneFunc={sceneFunc} hitFunc={hitFunc} {...shadowProps} />
}

export default PartShape
