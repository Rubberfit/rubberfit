import React from "react"
import type { PreviewItem } from "./nesting-visualizer-types"
import { polygonCentroid } from "./part-label"

// Phase 5 PR 3 (Treatment 1 — Precision Nesting / Industrial CAD).
//
// Each cut part renders as a solid slate body with a 1px slate-700
// stroke and a CSS drop-shadow simulating the part sitting proud of
// the sheet. Solid (no gradient) per founder feedback — the drop
// shadow + stroke carry the dimensional read on their own.
//
// All three values pull from `--svg-*` CSS variables in `globals.css`
// so the renderer adapts to `<html class="dark">` without any React
// branching. Light mode: dark slate fill + dark drop shadow. Dark
// mode: lighter slate fill + a faint white-glow shadow ("lit edge"
// effect on the deep stone-900 sheet).
//
// CSS `drop-shadow` is GPU-composited on modern Blink/WebKit and
// avoids the per-element rasterization cost of SVG `<filter>` at
// scale (a packed sheet can have 100+ parts).
//
// The `stone-900 + wastePattern` bbox crutch on circle/sector/
// trapezoid stays gone permanently — Codex confirmed it carried no
// information the underlying scrap/offcut classification didn't
// already cover. The two-pass `background`/`foreground` machinery
// stays collapsed to a single pass for the same reason.

const PART_FILL = "var(--svg-part-fill)"
const PART_STROKE = "var(--svg-part-stroke)"
const PART_STROKE_WIDTH = "1"
const PART_SHADOW_STYLE: React.CSSProperties = {
  filter: "drop-shadow(1px 2px 2px var(--svg-part-shadow))",
}

interface NestingShapeRendererProps {
  item: PreviewItem
  index: number
  surfaceX: number
  surfaceY: number
  unitOriginX: number
  unitOriginY: number
  scale: number
  tagLetter?: string
  zoom?: number
  /**
   * When the SheetSvg wrapper is rotated -90° via `<g transform>`,
   * each tag `<text>` counter-rotates so labels read upright. Pivot
   * is the text's own (x, y) so it stays anchored over its part.
   */
  displayRotated?: boolean
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
  tagLetter,
  displayRotated,
  zoom = 1,
}: {
  item: PreviewItem
  index: number
  coords: ShapeCoords
  surfaceX: number
  surfaceY: number
  unitOriginX: number
  unitOriginY: number
  scale: number
  tagLetter?: string
  displayRotated?: boolean
  zoom?: number
}) {
  // Caller only invokes PolygonShape on items that already carry a
  // placedPolygon; the type system can't see that, so narrow once via
  // an early return rather than spraying `!` across the renderer.
  const placedPolygon = item.placedPolygon
  if (!placedPolygon || placedPolygon.length === 0) {
    return null
  }

  const polyPoints = placedPolygon
    .map(
      (pt) =>
        `${surfaceX + (pt.x - unitOriginX) * scale},${surfaceY + (pt.y - unitOriginY) * scale}`
    )
    .join(" ")
  // Label position: area-weighted polygon centroid, NOT the bbox centre.
  // For concave shapes (e.g. a 150° annular sector), the bbox centre
  // lands outside the silhouette; the centroid sits inside the actual
  // filled region.
  const centroid = polygonCentroid(placedPolygon)
  const labelX = surfaceX + (centroid.x - unitOriginX) * scale
  const labelY = surfaceY + (centroid.y - unitOriginY) * scale
  return (
    <g key={index + 1}>
      <polygon
        points={polyPoints}
        fill={PART_FILL}
        stroke={PART_STROKE}
        strokeWidth={PART_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        style={PART_SHADOW_STYLE}
      />
      <text
        x={labelX}
        y={labelY}
        transform={displayRotated ? `rotate(90 ${labelX} ${labelY})` : undefined}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-shape-label stroke-shape-label-halo"
        style={{ paintOrder: "stroke" }}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        fontSize={Math.max(0, Math.min(14 / zoom, coords.pw * 0.3, coords.ph * 0.3))}
        fontWeight="700"
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
  tagLetter,
  displayRotated,
  zoom = 1,
}: {
  item: PreviewItem
  index: number
  coords: ShapeCoords
  tagLetter?: string
  displayRotated?: boolean
  zoom?: number
}) {
  const diameter = item.diameter ?? item.width
  const r = (diameter / 2) * (coords.pw / item.width)
  const cx = coords.px + coords.pw / 2
  const cy = coords.py + coords.ph / 2
  return (
    <g key={index + 1}>
      <circle
        cx={cx}
        cy={cy}
        r={Math.max(r - 1, 0)}
        fill={PART_FILL}
        stroke={PART_STROKE}
        strokeWidth={PART_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        style={PART_SHADOW_STYLE}
      />
      <text
        x={cx}
        y={cy}
        transform={displayRotated ? `rotate(90 ${cx} ${cy})` : undefined}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-shape-label stroke-shape-label-halo"
        style={{ paintOrder: "stroke" }}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        fontSize={Math.max(0, Math.min(14 / zoom, coords.pw * 0.3, coords.ph * 0.3))}
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
  tagLetter,
  displayRotated,
  zoom = 1,
}: {
  item: PreviewItem
  index: number
  coords: ShapeCoords
  tagLetter?: string
  displayRotated?: boolean
  zoom?: number
}) {
  const scale = coords.pw / item.width
  const innerR = (item.innerRadius ?? 0) * scale
  const outerR = (item.outerRadius ?? 0) * scale
  const arcDeg = item.arcDegrees ?? 120
  const halfArc = (arcDeg * Math.PI) / 360
  const flipSign = item.flipped ? -1 : 1
  const arcAngleOffset = item.rotated90 ? Math.PI / 2 : 0
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
      <path
        d={buildArcPath()}
        fill={PART_FILL}
        stroke={PART_STROKE}
        strokeWidth={PART_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        style={PART_SHADOW_STYLE}
      />
      <text
        x={coords.px + coords.pw / 2}
        y={coords.py + coords.ph / 2}
        transform={
          displayRotated
            ? `rotate(90 ${coords.px + coords.pw / 2} ${coords.py + coords.ph / 2})`
            : undefined
        }
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-shape-label stroke-shape-label-halo"
        style={{ paintOrder: "stroke" }}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        fontSize={Math.max(0, Math.min(14 / zoom, coords.pw * 0.3, coords.ph * 0.3))}
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
  tagLetter,
  displayRotated,
  zoom = 1,
}: {
  item: PreviewItem
  index: number
  coords: ShapeCoords
  tagLetter?: string
  displayRotated?: boolean
  zoom?: number
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
      <path
        d={buildTrapPath()}
        fill={PART_FILL}
        stroke={PART_STROKE}
        strokeWidth={PART_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        style={PART_SHADOW_STYLE}
      />
      <text
        x={coords.px + coords.pw / 2}
        y={coords.py + coords.ph / 2}
        transform={
          displayRotated
            ? `rotate(90 ${coords.px + coords.pw / 2} ${coords.py + coords.ph / 2})`
            : undefined
        }
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-shape-label stroke-shape-label-halo"
        style={{ paintOrder: "stroke" }}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        fontSize={Math.max(0, Math.min(14 / zoom, coords.pw * 0.3, coords.ph * 0.3))}
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
  tagLetter,
  displayRotated,
  zoom = 1,
}: {
  item: PreviewItem
  index: number
  coords: ShapeCoords
  tagLetter?: string
  displayRotated?: boolean
  zoom?: number
}) {
  return (
    <g key={index + 1}>
      <rect
        x={coords.px + 0.5}
        y={coords.py + 0.5}
        width={coords.pw}
        height={coords.ph}
        fill={PART_FILL}
        stroke={PART_STROKE}
        strokeWidth={PART_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        style={PART_SHADOW_STYLE}
      />
      <text
        x={coords.px + coords.pw / 2}
        y={coords.py + coords.ph / 2 + Math.min(4, coords.ph * 0.05)}
        transform={
          displayRotated
            ? `rotate(90 ${coords.px + coords.pw / 2} ${coords.py + coords.ph / 2 + Math.min(4, coords.ph * 0.05)})`
            : undefined
        }
        textAnchor="middle"
        className="fill-shape-label stroke-shape-label-halo"
        style={{ paintOrder: "stroke" }}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        fontSize={Math.max(0, Math.min(14 / zoom, coords.pw * 0.3, coords.ph * 0.3))}
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
  tagLetter,
  zoom = 1,
  displayRotated,
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
        tagLetter={tagLetter}
        displayRotated={displayRotated}
        zoom={zoom}
      />
    )
  }

  if (item.renderShape === "circle") {
    return (
      <CircleShape
        item={item}
        index={index}
        coords={coords}
        tagLetter={tagLetter}
        displayRotated={displayRotated}
        zoom={zoom}
      />
    )
  }

  if (item.renderShape === "sector") {
    return (
      <SectorShape
        item={item}
        index={index}
        coords={coords}
        tagLetter={tagLetter}
        displayRotated={displayRotated}
        zoom={zoom}
      />
    )
  }

  if (item.renderShape === "trapezoid") {
    return (
      <TrapezoidShape
        item={item}
        index={index}
        coords={coords}
        tagLetter={tagLetter}
        displayRotated={displayRotated}
        zoom={zoom}
      />
    )
  }

  return (
    <RectShape
      item={item}
      index={index}
      coords={coords}
      tagLetter={tagLetter}
      displayRotated={displayRotated}
      zoom={zoom}
    />
  )
}
