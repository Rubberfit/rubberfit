"use client"

import { useEffect, useRef, useState } from "react"
import type { KonvaEventObject } from "konva/lib/Node"
import { Stage, Layer, Rect, Circle, Line, Text, Group } from "react-konva"
import type { LayoutModel, PlacedPart, LayoutRegion } from "./layout-model"
import { useKonvaTheme, type KonvaThemeTokens } from "./konva-theme"

/**
 * Callback when a draggable part finishes moving. Coordinates are
 * in SHEET INCHES (not pixels) so callers don't need to know the
 * canvas scale. Only fires when `draggable` is enabled.
 */
type PartDragEnd = (partId: string, xIn: number, yIn: number) => void

// ── Shape renderers ──────────────────────────────────────────────────────────

function PartShape({
  part,
  scale,
  fill,
  theme,
  draggable,
  onDragEnd,
}: {
  part: PlacedPart
  scale: number
  fill: string
  theme: KonvaThemeTokens
  draggable: boolean
  onDragEnd?: PartDragEnd
}) {
  const pw = part.width * scale
  const ph = part.height * scale

  // Outer Group sits at the part's top-left in pixel space. Children
  // render in that group's local frame (origin = part top-left), so
  // dragging the group moves everything — shape + label — as a unit.
  // On drag end we convert group-position back to sheet inches before
  // firing the callback.
  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if (!onDragEnd) return
    onDragEnd(part.id, e.target.x() / scale, e.target.y() / scale)
  }

  let body: React.ReactNode
  if (part.renderShape === "circle" && part.diameter != null) {
    const r = (part.diameter / 2) * scale
    body = (
      <Circle
        x={pw / 2}
        y={ph / 2}
        radius={r}
        fill={fill}
        stroke={theme.partStroke}
        strokeWidth={1}
      />
    )
  } else if (part.polygon && part.polygon.length >= 3) {
    // Polygon points are absolute sheet coords — translate them to
    // the group's local frame (part top-left) so dragging the group
    // moves the polygon with it.
    const points = part.polygon.flatMap((pt) => [(pt.x - part.x) * scale, (pt.y - part.y) * scale])
    body = <Line points={points} closed fill={fill} stroke={theme.partStroke} strokeWidth={1} />
  } else {
    body = (
      <Rect
        x={0}
        y={0}
        width={pw}
        height={ph}
        fill={fill}
        stroke={theme.partStroke}
        strokeWidth={1}
      />
    )
  }

  const fontSize = Math.max(9, Math.min(14, Math.min(pw, ph) / 3))

  return (
    <Group x={part.x * scale} y={part.y * scale} draggable={draggable} onDragEnd={handleDragEnd}>
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
}

function RegionShape({
  region,
  scale,
  fill,
  stroke,
}: {
  region: LayoutRegion
  scale: number
  fill: string
  stroke: string
}) {
  if (region.polygon && region.polygon.length >= 3) {
    const points = region.polygon.flatMap((pt) => [pt.x * scale, pt.y * scale])
    return <Line points={points} closed fill={fill} stroke={stroke} strokeWidth={0.5} />
  }
  return (
    <Rect
      x={region.x * scale}
      y={region.y * scale}
      width={region.width * scale}
      height={region.height * scale}
      fill={fill}
      stroke={stroke}
      strokeWidth={0.5}
    />
  )
}

// ── Grid lines (12" intervals) ───────────────────────────────────────────────

function GridLines({
  sheetW,
  sheetL,
  scale,
  stroke,
}: {
  sheetW: number
  sheetL: number
  scale: number
  stroke: string
}) {
  const vLines: number[] = []
  for (let x = 12; x < sheetW; x += 12) vLines.push(x)
  const hLines: number[] = []
  for (let y = 12; y < sheetL; y += 12) hLines.push(y)

  return (
    <>
      {vLines.map((x) => (
        <Line
          key={`v${x}`}
          points={[x * scale, 0, x * scale, sheetL * scale]}
          stroke={stroke}
          strokeWidth={0.5}
          listening={false}
        />
      ))}
      {hLines.map((y) => (
        <Line
          key={`h${y}`}
          points={[0, y * scale, sheetW * scale, y * scale]}
          stroke={stroke}
          strokeWidth={0.5}
          listening={false}
        />
      ))}
    </>
  )
}

// ── Main renderer ────────────────────────────────────────────────────────────

interface KonvaSheetRendererProps {
  layout: LayoutModel
  className?: string
  /**
   * When set, each rendered part is draggable; the callback fires on
   * drag end with the new position in sheet inches. Omitting the
   * prop leaves the canvas read-only (Auto-nest Graph surface).
   */
  onPartDragEnd?: PartDragEnd
}

export default function KonvaSheetRenderer({
  layout,
  className,
  onPartDragEnd,
}: KonvaSheetRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const theme = useKonvaTheme()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale =
    size.w > 0 && size.h > 0
      ? Math.min(size.w / layout.sheetWidth, size.h / layout.sheetLength) * 0.96
      : 0

  const stageW = Math.round(layout.sheetWidth * scale)
  const stageH = Math.round(layout.sheetLength * scale)
  const offsetX = Math.max(0, (size.w - stageW) / 2)
  const offsetY = Math.max(0, (size.h - stageH) / 2)

  return (
    <div ref={containerRef} className={className ?? "w-full h-full"}>
      {scale > 0 && (
        <Stage width={size.w} height={size.h} style={{ display: "block" }}>
          <Layer x={offsetX} y={offsetY}>
            {/* Sheet background */}
            <Rect
              x={0}
              y={0}
              width={stageW}
              height={stageH}
              fill={theme.sheetFill}
              stroke={theme.sheetStroke}
              strokeWidth={1}
            />

            {/* Grid */}
            <GridLines
              sheetW={layout.sheetWidth}
              sheetL={layout.sheetLength}
              scale={scale}
              stroke={theme.grid}
            />

            {/* Reusable offcut — amber */}
            {layout.offcuts.map((region, i) => (
              <RegionShape
                key={`offcut-${i}`}
                region={region}
                scale={scale}
                fill={theme.offcutFill}
                stroke={theme.offcutStroke}
              />
            ))}

            {/* Scrap / waste — red */}
            {layout.scrap.map((region, i) => (
              <RegionShape
                key={`scrap-${i}`}
                region={region}
                scale={scale}
                fill={theme.scrapFill}
                stroke={theme.scrapStroke}
              />
            ))}

            {/* Parts */}
            {layout.parts.map((part) => (
              <PartShape
                key={part.id}
                part={part}
                scale={scale}
                fill={theme.partFills[part.specIndex % theme.partFills.length]}
                theme={theme}
                draggable={typeof onPartDragEnd === "function"}
                onDragEnd={onPartDragEnd}
              />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  )
}
