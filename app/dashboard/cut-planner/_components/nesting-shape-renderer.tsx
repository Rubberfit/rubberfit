import React from "react"
import type { PreviewItem, SimplePartPreview } from "./nesting-visualizer-types"

interface NestingShapeRendererProps {
  item: PreviewItem
  index: number
  surfaceX: number
  surfaceY: number
  unitOriginX: number
  unitOriginY: number
  scale: number
  shapeFirstView: boolean
  preview: SimplePartPreview
  displayPreview: SimplePartPreview
  usablePatternId: string
  wastePatternId: string
  viewHeight: number
  surfacePxW: number
  tagLetter?: string
  zoom?: number
}

interface ShapeCoords {
  px: number
  py: number
  pw: number
  ph: number
  isFirst: boolean
}

function computeShapeCoords(
  item: PreviewItem,
  index: number,
  surfaceX: number,
  surfaceY: number,
  unitOriginX: number,
  unitOriginY: number,
  scale: number
): ShapeCoords {
  return {
    px: surfaceX + (item.x - unitOriginX) * scale,
    py: surfaceY + (item.y - unitOriginY) * scale,
    pw: item.width * scale,
    ph: item.height * scale,
    isFirst: index === 0,
  }
}

function PolygonShape({
  item,
  index,
  coords,
  surfaceX,
  surfaceY,
  unitOriginX,
  unitOriginY,
  scale,
  usablePatternId,
  wastePatternId,
  tagLetter,
}: {
  item: PreviewItem
  index: number
  coords: ShapeCoords
  surfaceX: number
  surfaceY: number
  unitOriginX: number
  unitOriginY: number
  scale: number
  usablePatternId: string
  wastePatternId: string
  tagLetter?: string
}) {
  const points = item
    .placedPolygon!.map(
      (pt) =>
        `${surfaceX + (pt.x - unitOriginX) * scale},${surfaceY + (pt.y - unitOriginY) * scale}`
    )
    .join(" ")
  return (
    <g key={index + 1}>
      <rect
        x={coords.px}
        y={coords.py}
        width={coords.pw}
        height={coords.ph}
        fill="#1c1917"
      />
      <rect
        x={coords.px}
        y={coords.py}
        width={coords.pw}
        height={coords.ph}
        fill={`url(#${wastePatternId})`}
        opacity="0.5"
      />
      <polygon
        points={points}
        fill={`url(#${usablePatternId})`}
        stroke="#84cc16"
        strokeWidth="1.5"
        opacity="0.95"
      />
      <text
        x={coords.px + coords.pw / 2}
        y={coords.py + coords.ph / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#e7e5e4"
        fontSize={Math.max(0, Math.min(10, coords.pw * 0.3, coords.ph * 0.3))}
        fontWeight="600"
      >
        {tagLetter ?? item.label}
      </text>
    </g>
  )
}

function CircleShape({
  item,
  index,
  coords,
  usablePatternId,
  wastePatternId,
  tagLetter,
}: {
  item: PreviewItem
  index: number
  coords: ShapeCoords
  usablePatternId: string
  wastePatternId: string
  tagLetter?: string
}) {
  const diameter = item.diameter ?? item.width
  const r = (diameter / 2) * (coords.pw / item.width)
  const cx = coords.px + coords.pw / 2
  const cy = coords.py + coords.ph / 2
  return (
    <g key={index + 1}>
      <rect
        x={coords.px}
        y={coords.py}
        width={coords.pw}
        height={coords.ph}
        fill={`url(#${wastePatternId})`}
        opacity="0.4"
        rx="2"
      />
      <circle
        cx={cx}
        cy={cy}
        r={Math.max(r - 1, 0)}
        fill={`url(#${usablePatternId})`}
        stroke="#84cc16"
        strokeWidth="1.5"
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={coords.isFirst ? "#e7e5e4" : "#bef264"}
        fontSize={Math.max(0, Math.min(10, r * 0.6))}
        fontWeight="600"
      >
        {tagLetter ?? item.label}
      </text>
    </g>
  )
}

function SectorShape({
  item,
  index,
  coords,
  usablePatternId,
  wastePatternId,
  tagLetter,
}: {
  item: PreviewItem
  index: number
  coords: ShapeCoords
  usablePatternId: string
  wastePatternId: string
  tagLetter?: string
}) {
  const scale = coords.pw / item.width
  const innerR = (item.innerRadius ?? 0) * scale
  const outerR = (item.outerRadius ?? 0) * scale
  const arcDeg = item.arcDegrees ?? 120
  const halfArc = (arcDeg * Math.PI) / 360
  const flipSign = item.flipped ? -1 : 1
  // When the packer rotated this item 90° CW, the arc dome points right instead of up.
  // Shift all arc angles by +π/2 and recompute cx/cy for the swapped bounding box.
  const arcAngleOffset = item.rotated90 ? Math.PI / 2 : 0
  // Rotated 90° CW: dome points right → apex at right edge, center = right_edge − outerR
  const cx = item.rotated90 ? coords.px + coords.pw - outerR : coords.px + coords.pw / 2
  const cy = item.rotated90 ? coords.py + coords.ph / 2 : coords.py + outerR

  const buildArcPath = () => {
    const a1 = -Math.PI / 2 - halfArc * flipSign + arcAngleOffset
    const a2 = -Math.PI / 2 + halfArc * flipSign + arcAngleOffset
    const x1o = cx + outerR * Math.cos(a1)
    const y1o = cy + outerR * Math.sin(a1)
    const x2o = cx + outerR * Math.cos(a2)
    const y2o = cy + outerR * Math.sin(a2)
    const x1i = cx + innerR * Math.cos(a2)
    const y1i = cy + innerR * Math.sin(a2)
    const x2i = cx + innerR * Math.cos(a1)
    const y2i = cy + innerR * Math.sin(a1)
    const lg = arcDeg > 180 ? 1 : 0
    const sweepOuter = item.flipped ? 0 : 1
    const sweepInner = item.flipped ? 1 : 0
    return `M${x1o} ${y1o} A${outerR} ${outerR} 0 ${lg} ${sweepOuter} ${x2o} ${y2o} L${x1i} ${y1i} A${innerR} ${innerR} 0 ${lg} ${sweepInner} ${x2i} ${y2i} Z`
  }

  return (
    <g key={index + 1}>
      <rect
        x={coords.px}
        y={coords.py}
        width={coords.pw}
        height={coords.ph}
        fill={`url(#${wastePatternId})`}
        opacity="0.4"
        rx="2"
      />
      <path
        d={buildArcPath()}
        fill={`url(#${usablePatternId})`}
        stroke="#84cc16"
        strokeWidth="1.5"
      />
      <text
        x={coords.px + coords.pw / 2}
        y={coords.py + coords.ph / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={coords.isFirst ? "#e7e5e4" : "#bef264"}
        fontSize={Math.max(0, Math.min(10, coords.pw * 0.3, coords.ph * 0.3))}
        fontWeight="600"
      >
        {tagLetter ?? item.label}
      </text>
    </g>
  )
}

function TrapezoidShape({
  item,
  index,
  coords,
  usablePatternId,
  wastePatternId,
  tagLetter,
}: {
  item: PreviewItem
  index: number
  coords: ShapeCoords
  usablePatternId: string
  wastePatternId: string
  tagLetter?: string
}) {
  const scale = coords.pw / item.width
  const topW = (item.topWidth ?? item.width) * scale
  const botW = (item.bottomWidth ?? item.width) * scale
  const topInsetLeft = (coords.pw - topW) / 2
  const topInsetRight = coords.pw - topInsetLeft
  const botInsetLeft = (coords.pw - botW) / 2
  const botInsetRight = coords.pw - botInsetLeft

  const buildTrapPath = () => {
    if (item.flipped) {
      return `M${coords.px + botInsetLeft} ${coords.py} L${coords.px + botInsetRight} ${coords.py} L${coords.px + topInsetRight} ${coords.py + coords.ph} L${coords.px + topInsetLeft} ${coords.py + coords.ph} Z`
    }
    return `M${coords.px + topInsetLeft} ${coords.py} L${coords.px + topInsetRight} ${coords.py} L${coords.px + botInsetRight} ${coords.py + coords.ph} L${coords.px + botInsetLeft} ${coords.py + coords.ph} Z`
  }

  return (
    <g key={index + 1}>
      <rect
        x={coords.px}
        y={coords.py}
        width={coords.pw}
        height={coords.ph}
        fill={`url(#${wastePatternId})`}
        opacity="0.4"
        rx="2"
      />
      <path
        d={buildTrapPath()}
        fill={`url(#${usablePatternId})`}
        stroke="#84cc16"
        strokeWidth="1.5"
      />
      <text
        x={coords.px + coords.pw / 2}
        y={coords.py + coords.ph / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={coords.isFirst ? "#e7e5e4" : "#bef264"}
        fontSize={Math.max(0, Math.min(10, coords.pw * 0.3, coords.ph * 0.3))}
        fontWeight="600"
      >
        {tagLetter ?? item.label}
      </text>
    </g>
  )
}

function RectShape({
  item,
  index,
  coords,
  usablePatternId,
  tagLetter,
}: {
  item: PreviewItem
  index: number
  coords: ShapeCoords
  usablePatternId: string
  tagLetter?: string
}) {
  return (
    <g key={index + 1}>
      <rect
        x={coords.px + 0.5}
        y={coords.py + 0.5}
        width={coords.pw}
        height={coords.ph}
        fill={`url(#${usablePatternId})`}
        stroke="#84cc16"
        strokeWidth="1"
      />
      <text
        x={coords.px + coords.pw / 2}
        y={coords.py + coords.ph / 2 + Math.min(4, coords.ph * 0.05)}
        textAnchor="middle"
        fill="#e7e5e4"
        fontSize={Math.min(28, Math.min(coords.pw * 0.4, coords.ph * 0.35))}
        fontWeight="700"
      >
        {tagLetter ?? item.label}
      </text>
    </g>
  )
}

export default function NestingShapeRenderer({
  item,
  index,
  surfaceX,
  surfaceY,
  unitOriginX,
  unitOriginY,
  scale,
  shapeFirstView: _shapeFirstView,
  preview: _preview,
  displayPreview: _displayPreview,
  usablePatternId,
  wastePatternId,
  viewHeight: _viewHeight,
  surfacePxW: _surfacePxW,
  tagLetter,
  zoom: _zoom,
}: NestingShapeRendererProps) {
  const coords = computeShapeCoords(
    item,
    index,
    surfaceX,
    surfaceY,
    unitOriginX,
    unitOriginY,
    scale
  )

  if (item.placedPolygon && item.placedPolygon.length > 0) {
    return (
      <PolygonShape
        item={item}
        index={index}
        coords={coords}
        surfaceX={surfaceX}
        surfaceY={surfaceY}
        unitOriginX={unitOriginX}
        unitOriginY={unitOriginY}
        scale={scale}
        usablePatternId={usablePatternId}
        wastePatternId={wastePatternId}
        tagLetter={tagLetter}
      />
    )
  }

  if (item.renderShape === "circle") {
    return (
      <CircleShape
        item={item}
        index={index}
        coords={coords}
        usablePatternId={usablePatternId}
        wastePatternId={wastePatternId}
        tagLetter={tagLetter}
      />
    )
  }

  if (item.renderShape === "sector") {
    return (
      <SectorShape
        item={item}
        index={index}
        coords={coords}
        usablePatternId={usablePatternId}
        wastePatternId={wastePatternId}
        tagLetter={tagLetter}
      />
    )
  }

  if (item.renderShape === "trapezoid") {
    return (
      <TrapezoidShape
        item={item}
        index={index}
        coords={coords}
        usablePatternId={usablePatternId}
        wastePatternId={wastePatternId}
        tagLetter={tagLetter}
      />
    )
  }

  return (
    <RectShape
      item={item}
      index={index}
      coords={coords}
      usablePatternId={usablePatternId}
      tagLetter={tagLetter}
    />
  )
}
