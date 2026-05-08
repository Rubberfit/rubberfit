"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import type { KonvaEventObject } from "konva/lib/Node"
import type { Group as KonvaGroupNode } from "konva/lib/Group"
import { Circle, Ellipse, Group, Line, Rect, Ring, Text } from "react-konva"

import type { PlacedPart } from "./layout-model"
import type { KonvaThemeTokens } from "./konva-theme"

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
        x={0}
        y={ph / 2 - fontSize}
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

export default PartShape
