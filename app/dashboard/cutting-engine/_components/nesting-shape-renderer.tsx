import React from "react"
import type { PreviewItem } from "./nesting-visualizer-types"
import { polygonCentroid } from "./part-label"

// Phase 5 PR 3 (Treatment 1 — Precision Nesting / Industrial CAD) +
// PR 4 (interactive selection/hover/focus). The flat state matches
// PR 3 exactly. PR 4 adds three additional visual states driven by
// `--svg-part-*` CSS variables and lifted by the SVG-level event
// delegation in `SheetSvg`:
//
//   hover    — CSS-only via `g[data-part-id]:hover .part-shape` in
//              globals.css. No React state, no per-element handlers,
//              so 100+ parts don't each trigger a re-render on cursor
//              movement.
//   selected — inline `style={SELECTED_SHADOW_STYLE}` + teal stroke;
//              hover rule is suppressed via `data-selected="true"`.
//   focused  — distinct dashed teal overlay so the keyboard ring is
//              visually distinguishable from selection. Suppressed
//              when also selected (operator sees one unambiguous
//              solid teal ring).

const PART_FILL = "var(--svg-part-fill)"
const PART_STROKE = "var(--svg-part-stroke)"
const PART_STROKE_WIDTH = "1"
const PART_SHADOW_STYLE: React.CSSProperties = {
  filter: "drop-shadow(1px 2px 2px var(--svg-part-shadow))",
}
const SELECTED_SHADOW_STYLE: React.CSSProperties = {
  filter: "drop-shadow(0 4px 10px var(--svg-part-selected-shadow))",
}

// PR 5 — Selection ring inner halo. The 2px teal selection stroke
// alone fails WCAG 3:1 against the part fill in dark mode (teal-400
// on slate-400 ≈ 1.4:1) and against the warm-stone sheet in light
// mode (teal-700 on stone-500 ≈ 1.2:1). The halo is a 4px page-colored
// stroke rendered UNDER the 2px teal stroke, producing a 1px
// page-colored band on each side of the teal ring. That band
// guarantees ≥ 7:1 contrast at the boundary teal-meets-halo, which
// is the adjacency a low-vision operator actually sees. The same
// approach is reused for the focus ring (dashed).
const SELECTION_HALO_STROKE = "var(--svg-page-bg)"
const SELECTION_HALO_WIDTH = "4"
const SELECTION_RING_WIDTH = "2"
const FOCUS_HALO_WIDTH = "3.5"
const FOCUS_RING_WIDTH = "1.5"

// PR 7 — minimum on-screen pixel size for a tag letter to render.
// Because the viewBox shrinks with zoom (1..8), the font formula
// divides by `zoom` to keep absolute screen-pixel size stable. A raw
// `fontSize` cutoff would falsely hide labels at high zoom. The right
// check is `fontSize * zoom`, i.e. the screen pixels the operator
// actually perceives. 9px (not 8) because the halo stroke adds visual
// mass and sub-9px bold letters become noise on dense sheets.
const MIN_LABEL_SCREEN_PX = 9
// PR 7 — when the operator is zoomed out (≤ 1.5) AND the sheet carries
// more than this many parts, suppress all labels regardless of
// individual computed size. Even nominally legible letters overlap
// into noise at this density.
const LABEL_DENSITY_THRESHOLD = 20
const LABEL_DENSITY_ZOOM_CAP = 1.5

/**
 * Returns the tag-letter `fontSize` for a given part bounding box, or
 * `null` when the label would render below the legibility floor. The
 * callers either omit the `<text>` entirely when this returns `null`
 * (no fade — a fade animation flickers on wheel zoom, per Codex's
 * pre-implementation note) or pass the returned number to `fontSize`.
 */
function resolveLabelFontSize(
  zoom: number,
  pw: number,
  ph: number,
  totalPartsOnSheet: number
): number | null {
  if (totalPartsOnSheet > LABEL_DENSITY_THRESHOLD && zoom <= LABEL_DENSITY_ZOOM_CAP) {
    return null
  }
  const fontSize = Math.max(0, Math.min(14 / zoom, pw * 0.3, ph * 0.3))
  if (fontSize * zoom < MIN_LABEL_SCREEN_PX) {
    return null
  }
  return fontSize
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
  /**
   * `PlacedPart.id` from the parallel `layoutModel.parts[index]`.
   * When absent (frozen legacy layouts that pre-date the Rust
   * adapter, see `layout-model.ts` `fromLayoutModelToPreview`), the
   * part renders flat and non-interactive — no role, no aria, no
   * tabindex — so screen readers and keyboard users don't pick up
   * dead targets.
   */
  partId?: string
  isSelected?: boolean
  isFocused?: boolean
  /** Roving tabindex: 0 for the part currently in the tab order, -1 for the rest. */
  tabIndex?: number
  ariaLabel?: string
  /**
   * Total parts on the sheet this shape belongs to. Used by the
   * PR 7 label-clutter rules to suppress every tag at low zoom when
   * the density would make labels unreadable.
   */
  totalPartsOnSheet?: number
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

interface ShapeComponentProps extends NestingShapeRendererProps {
  coords: ShapeCoords
}

// Outer `<g>` attrs are identical across the 5 shape variants —
// centralized so the role/aria/tabindex/data-part-id contract is
// declared once. SVG-level event delegation in `SheetSvg` resolves
// the part by walking `e.target.closest('[data-part-id]')`.
function shapeGroupProps({
  partId,
  isSelected,
  tabIndex,
  ariaLabel,
}: Pick<NestingShapeRendererProps, "partId" | "isSelected" | "tabIndex" | "ariaLabel">) {
  return {
    "data-part-id": partId,
    role: partId ? "button" : undefined,
    "aria-pressed": partId ? Boolean(isSelected) : undefined,
    "aria-label": ariaLabel,
    tabIndex: partId ? (tabIndex ?? -1) : undefined,
    className:
      "part-shape-group focus-visible:outline-none transition-all motion-reduce:transition-none" +
      (partId ? " cursor-pointer" : ""),
  } as const
}

function PolygonShape({
  item,
  surfaceX,
  surfaceY,
  unitOriginX,
  unitOriginY,
  scale,
  displayRotated,
  zoom,
  tagLetter,
  partId,
  isSelected,
  isFocused,
  tabIndex,
  ariaLabel,
  coords,
  totalPartsOnSheet,
}: ShapeComponentProps) {
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
  const labelFontSize = resolveLabelFontSize(
    zoom ?? 1,
    coords.pw,
    coords.ph,
    totalPartsOnSheet ?? 0
  )

  return (
    <g {...shapeGroupProps({ partId, isSelected, tabIndex, ariaLabel })}>
      <polygon
        className="part-shape"
        data-selected={isSelected ? "true" : "false"}
        points={polyPoints}
        fill={PART_FILL}
        stroke={PART_STROKE}
        strokeWidth={PART_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        style={isSelected ? SELECTED_SHADOW_STYLE : PART_SHADOW_STYLE}
      />
      {isSelected && (
        <>
          <polygon
            points={polyPoints}
            fill="none"
            stroke={SELECTION_HALO_STROKE}
            strokeWidth={SELECTION_HALO_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <polygon
            points={polyPoints}
            fill="none"
            stroke="var(--svg-part-selected-stroke)"
            strokeWidth={SELECTION_RING_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      )}
      {isFocused && !isSelected && (
        <>
          <polygon
            points={polyPoints}
            fill="none"
            stroke={SELECTION_HALO_STROKE}
            strokeWidth={FOCUS_HALO_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <polygon
            points={polyPoints}
            fill="none"
            stroke="var(--svg-part-focus-stroke)"
            strokeWidth={FOCUS_RING_WIDTH}
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      )}
      {labelFontSize !== null && (
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
          fontSize={labelFontSize}
          fontWeight="700"
        >
          {tagLetter ?? item.label}
        </text>
      )}
    </g>
  )
}

function CircleShape({
  item,
  displayRotated,
  zoom,
  tagLetter,
  partId,
  isSelected,
  isFocused,
  tabIndex,
  ariaLabel,
  coords,
  totalPartsOnSheet,
}: ShapeComponentProps) {
  const diameter = item.diameter ?? item.width
  const r = (diameter / 2) * (coords.pw / item.width)
  const cx = coords.px + coords.pw / 2
  const cy = coords.py + coords.ph / 2
  const effectiveR = Math.max(r - 1, 0)
  const labelFontSize = resolveLabelFontSize(
    zoom ?? 1,
    coords.pw,
    coords.ph,
    totalPartsOnSheet ?? 0
  )

  return (
    <g {...shapeGroupProps({ partId, isSelected, tabIndex, ariaLabel })}>
      <circle
        className="part-shape"
        data-selected={isSelected ? "true" : "false"}
        cx={cx}
        cy={cy}
        r={effectiveR}
        fill={PART_FILL}
        stroke={PART_STROKE}
        strokeWidth={PART_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        style={isSelected ? SELECTED_SHADOW_STYLE : PART_SHADOW_STYLE}
      />
      {isSelected && (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={effectiveR}
            fill="none"
            stroke={SELECTION_HALO_STROKE}
            strokeWidth={SELECTION_HALO_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <circle
            cx={cx}
            cy={cy}
            r={effectiveR}
            fill="none"
            stroke="var(--svg-part-selected-stroke)"
            strokeWidth={SELECTION_RING_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      )}
      {isFocused && !isSelected && (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={effectiveR}
            fill="none"
            stroke={SELECTION_HALO_STROKE}
            strokeWidth={FOCUS_HALO_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <circle
            cx={cx}
            cy={cy}
            r={effectiveR}
            fill="none"
            stroke="var(--svg-part-focus-stroke)"
            strokeWidth={FOCUS_RING_WIDTH}
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      )}
      {labelFontSize !== null && (
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
          fontSize={labelFontSize}
          fontWeight="600"
        >
          {tagLetter ?? item.label}
        </text>
      )}
    </g>
  )
}

function SectorShape({
  item,
  displayRotated,
  zoom,
  tagLetter,
  partId,
  isSelected,
  isFocused,
  tabIndex,
  ariaLabel,
  coords,
  totalPartsOnSheet,
}: ShapeComponentProps) {
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

  const labelX = coords.px + coords.pw / 2
  const labelY = coords.py + coords.ph / 2
  const arcPath = buildArcPath()
  const labelFontSize = resolveLabelFontSize(
    zoom ?? 1,
    coords.pw,
    coords.ph,
    totalPartsOnSheet ?? 0
  )

  return (
    <g {...shapeGroupProps({ partId, isSelected, tabIndex, ariaLabel })}>
      <path
        className="part-shape"
        data-selected={isSelected ? "true" : "false"}
        d={arcPath}
        fill={PART_FILL}
        stroke={PART_STROKE}
        strokeWidth={PART_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        style={isSelected ? SELECTED_SHADOW_STYLE : PART_SHADOW_STYLE}
      />
      {isSelected && (
        <>
          <path
            d={arcPath}
            fill="none"
            stroke={SELECTION_HALO_STROKE}
            strokeWidth={SELECTION_HALO_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <path
            d={arcPath}
            fill="none"
            stroke="var(--svg-part-selected-stroke)"
            strokeWidth={SELECTION_RING_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      )}
      {isFocused && !isSelected && (
        <>
          <path
            d={arcPath}
            fill="none"
            stroke={SELECTION_HALO_STROKE}
            strokeWidth={FOCUS_HALO_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <path
            d={arcPath}
            fill="none"
            stroke="var(--svg-part-focus-stroke)"
            strokeWidth={FOCUS_RING_WIDTH}
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      )}
      {labelFontSize !== null && (
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
          fontSize={labelFontSize}
          fontWeight="600"
        >
          {tagLetter ?? item.label}
        </text>
      )}
    </g>
  )
}

function TrapezoidShape({
  item,
  displayRotated,
  zoom,
  tagLetter,
  partId,
  isSelected,
  isFocused,
  tabIndex,
  ariaLabel,
  coords,
  totalPartsOnSheet,
}: ShapeComponentProps) {
  const scale = coords.pw / item.width
  const topW = (item.topWidth ?? item.width) * scale
  const botW = (item.bottomWidth ?? item.width) * scale
  const topInsetLeft = (coords.pw - topW) / 2
  const topInsetRight = coords.pw - topInsetLeft
  const botInsetLeft = (coords.pw - botW) / 2
  const botInsetRight = coords.pw - botInsetLeft

  // Non-flipped: bottom-left vertex is `botInsetLeft`. Using
  // `topInsetLeft` there regressed once during PR 3 and was caught
  // by Sigilix + CodeRabbit — see PR #219 review thread.
  const buildTrapPath = () => {
    if (item.flipped) {
      return `M${coords.px + botInsetLeft} ${coords.py} L${coords.px + botInsetRight} ${coords.py} L${coords.px + topInsetRight} ${coords.py + coords.ph} L${coords.px + topInsetLeft} ${coords.py + coords.ph} Z`
    }
    return `M${coords.px + topInsetLeft} ${coords.py} L${coords.px + topInsetRight} ${coords.py} L${coords.px + botInsetRight} ${coords.py + coords.ph} L${coords.px + botInsetLeft} ${coords.py + coords.ph} Z`
  }

  const textX = coords.px + coords.pw / 2
  const textY = coords.py + coords.ph / 2
  const trapPath = buildTrapPath()
  const labelFontSize = resolveLabelFontSize(
    zoom ?? 1,
    coords.pw,
    coords.ph,
    totalPartsOnSheet ?? 0
  )

  return (
    <g {...shapeGroupProps({ partId, isSelected, tabIndex, ariaLabel })}>
      <path
        className="part-shape"
        data-selected={isSelected ? "true" : "false"}
        d={trapPath}
        fill={PART_FILL}
        stroke={PART_STROKE}
        strokeWidth={PART_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        style={isSelected ? SELECTED_SHADOW_STYLE : PART_SHADOW_STYLE}
      />
      {isSelected && (
        <>
          <path
            d={trapPath}
            fill="none"
            stroke={SELECTION_HALO_STROKE}
            strokeWidth={SELECTION_HALO_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <path
            d={trapPath}
            fill="none"
            stroke="var(--svg-part-selected-stroke)"
            strokeWidth={SELECTION_RING_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      )}
      {isFocused && !isSelected && (
        <>
          <path
            d={trapPath}
            fill="none"
            stroke={SELECTION_HALO_STROKE}
            strokeWidth={FOCUS_HALO_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <path
            d={trapPath}
            fill="none"
            stroke="var(--svg-part-focus-stroke)"
            strokeWidth={FOCUS_RING_WIDTH}
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      )}
      {labelFontSize !== null && (
        <text
          x={textX}
          y={textY}
          transform={displayRotated ? `rotate(90 ${textX} ${textY})` : undefined}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-shape-label stroke-shape-label-halo"
          style={{ paintOrder: "stroke" }}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          fontSize={labelFontSize}
          fontWeight="600"
        >
          {tagLetter ?? item.label}
        </text>
      )}
    </g>
  )
}

function RectShape({
  item,
  displayRotated,
  zoom,
  tagLetter,
  partId,
  isSelected,
  isFocused,
  tabIndex,
  ariaLabel,
  coords,
  totalPartsOnSheet,
}: ShapeComponentProps) {
  const textX = coords.px + coords.pw / 2
  const textY = coords.py + coords.ph / 2 + Math.min(4, coords.ph * 0.05)
  const labelFontSize = resolveLabelFontSize(
    zoom ?? 1,
    coords.pw,
    coords.ph,
    totalPartsOnSheet ?? 0
  )

  return (
    <g {...shapeGroupProps({ partId, isSelected, tabIndex, ariaLabel })}>
      <rect
        className="part-shape"
        data-selected={isSelected ? "true" : "false"}
        x={coords.px + 0.5}
        y={coords.py + 0.5}
        width={coords.pw}
        height={coords.ph}
        fill={PART_FILL}
        stroke={PART_STROKE}
        strokeWidth={PART_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        style={isSelected ? SELECTED_SHADOW_STYLE : PART_SHADOW_STYLE}
      />
      {isSelected && (
        <>
          <rect
            x={coords.px + 0.5}
            y={coords.py + 0.5}
            width={coords.pw}
            height={coords.ph}
            fill="none"
            stroke={SELECTION_HALO_STROKE}
            strokeWidth={SELECTION_HALO_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <rect
            x={coords.px + 0.5}
            y={coords.py + 0.5}
            width={coords.pw}
            height={coords.ph}
            fill="none"
            stroke="var(--svg-part-selected-stroke)"
            strokeWidth={SELECTION_RING_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      )}
      {isFocused && !isSelected && (
        <>
          <rect
            x={coords.px + 0.5}
            y={coords.py + 0.5}
            width={coords.pw}
            height={coords.ph}
            fill="none"
            stroke={SELECTION_HALO_STROKE}
            strokeWidth={FOCUS_HALO_WIDTH}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <rect
            x={coords.px + 0.5}
            y={coords.py + 0.5}
            width={coords.pw}
            height={coords.ph}
            fill="none"
            stroke="var(--svg-part-focus-stroke)"
            strokeWidth={FOCUS_RING_WIDTH}
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      )}
      {labelFontSize !== null && (
        <text
          x={textX}
          y={textY}
          transform={displayRotated ? `rotate(90 ${textX} ${textY})` : undefined}
          textAnchor="middle"
          className="fill-shape-label stroke-shape-label-halo"
          style={{ paintOrder: "stroke" }}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          fontSize={labelFontSize}
          fontWeight="700"
        >
          {tagLetter ?? item.label}
        </text>
      )}
    </g>
  )
}

export default function NestingShapeRenderer(props: NestingShapeRendererProps) {
  const coords = computeShapeCoords(
    props.item,
    props.index,
    props.surfaceX,
    props.surfaceY,
    props.unitOriginX,
    props.unitOriginY,
    props.scale
  )

  if (props.item.placedPolygon && props.item.placedPolygon.length > 0) {
    return <PolygonShape {...props} coords={coords} />
  }
  if (props.item.renderShape === "circle") {
    return <CircleShape {...props} coords={coords} />
  }
  if (props.item.renderShape === "sector") {
    return <SectorShape {...props} coords={coords} />
  }
  if (props.item.renderShape === "trapezoid") {
    return <TrapezoidShape {...props} coords={coords} />
  }
  return <RectShape {...props} coords={coords} />
}
