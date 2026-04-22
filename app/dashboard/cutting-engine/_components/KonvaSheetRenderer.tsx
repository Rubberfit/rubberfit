"use client"

import { useEffect, useRef, useState } from "react"
import { Stage, Layer, Rect, Circle, Line, Text, Group } from "react-konva"
import type { LayoutModel, PlacedPart, LayoutRegion } from "./layout-model"

// ── Colour palette (index by specIndex mod length) ───────────────────────────

const PART_FILLS = [
  "#3b82f6", // blue-500
  "#ef4444", // red-500
  "#22c55e", // green-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
]

const OFFCUT_FILL = "rgba(219, 234, 254, 0.55)" // blue-100 semi-transparent
const OFFCUT_STROKE = "#93c5fd" // blue-300
const SHEET_FILL = "#f5f5f4" // stone-100
const SHEET_STROKE = "#a8a29e" // stone-400
const GRID_STROKE = "#e7e5e4" // stone-200
const LABEL_FILL = "#ffffff"

// ── Shape renderers ──────────────────────────────────────────────────────────

function PartShape({ part, scale }: { part: PlacedPart; scale: number }) {
  const fill = PART_FILLS[part.specIndex % PART_FILLS.length]
  const px = part.x * scale
  const py = part.y * scale
  const pw = part.width * scale
  const ph = part.height * scale
  const cx = px + pw / 2
  const cy = py + ph / 2

  if (part.renderShape === "circle" && part.diameter != null) {
    const r = (part.diameter / 2) * scale
    return (
      <Group>
        <Circle x={cx} y={cy} radius={r} fill={fill} stroke="white" strokeWidth={1} />
        <Text
          x={cx - pw / 2}
          y={cy - 8}
          width={pw}
          height={16}
          text={part.label}
          fontSize={Math.max(9, Math.min(14, pw / 3))}
          fill={LABEL_FILL}
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    )
  }

  // Polygon-based shapes (trapezoid, sector, or any non-rect with a polygon)
  if (part.polygon && part.polygon.length >= 3) {
    const points = part.polygon.flatMap((pt) => [pt.x * scale, pt.y * scale])
    return (
      <Group>
        <Line points={points} closed fill={fill} stroke="white" strokeWidth={1} />
        <Text
          x={cx - pw / 2}
          y={cy - 8}
          width={pw}
          height={16}
          text={part.label}
          fontSize={Math.max(9, Math.min(14, pw / 3))}
          fill={LABEL_FILL}
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    )
  }

  // Fallback: plain rectangle
  return (
    <Group>
      <Rect x={px} y={py} width={pw} height={ph} fill={fill} stroke="white" strokeWidth={1} />
      <Text
        x={px}
        y={cy - 8}
        width={pw}
        height={16}
        text={part.label}
        fontSize={Math.max(9, Math.min(14, Math.min(pw, ph) / 3))}
        fill={LABEL_FILL}
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </Group>
  )
}

function OffcutShape({ region, scale }: { region: LayoutRegion; scale: number }) {
  if (region.polygon && region.polygon.length >= 3) {
    const points = region.polygon.flatMap((pt) => [pt.x * scale, pt.y * scale])
    return (
      <Line points={points} closed fill={OFFCUT_FILL} stroke={OFFCUT_STROKE} strokeWidth={0.5} />
    )
  }
  return (
    <Rect
      x={region.x * scale}
      y={region.y * scale}
      width={region.width * scale}
      height={region.height * scale}
      fill={OFFCUT_FILL}
      stroke={OFFCUT_STROKE}
      strokeWidth={0.5}
    />
  )
}

// ── Grid lines (12" intervals) ───────────────────────────────────────────────

function GridLines({ sheetW, sheetL, scale }: { sheetW: number; sheetL: number; scale: number }) {
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
          stroke={GRID_STROKE}
          strokeWidth={0.5}
          listening={false}
        />
      ))}
      {hLines.map((y) => (
        <Line
          key={`h${y}`}
          points={[0, y * scale, sheetW * scale, y * scale]}
          stroke={GRID_STROKE}
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
}

export default function KonvaSheetRenderer({ layout, className }: KonvaSheetRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

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
  // Center the sheet within the container
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
              fill={SHEET_FILL}
              stroke={SHEET_STROKE}
              strokeWidth={1}
            />

            {/* Grid */}
            <GridLines sheetW={layout.sheetWidth} sheetL={layout.sheetLength} scale={scale} />

            {/* Offcuts */}
            {layout.offcuts.map((region, i) => (
              <OffcutShape key={`offcut-${i}`} region={region} scale={scale} />
            ))}

            {/* Parts */}
            {layout.parts.map((part) => (
              <PartShape key={part.id} part={part} scale={scale} />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  )
}
