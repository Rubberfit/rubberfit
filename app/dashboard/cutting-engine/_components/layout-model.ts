import type {
  SimplePartPreview,
  RectLikePreview,
  OffcutBand,
  PreviewItem,
  MultiSheetResult,
} from "./nesting-visualizer-types"
import type { SimpleCutDirection } from "./nesting-visualizer-types"

/**
 * Shape-family dispatch for the Konva renderer + PDF renderer.
 *
 * - Primitives that map to a Konva native shape: `rect`, `circle`,
 *   `ellipse`, `ring`.
 * - Primitives that Konva doesn't ship but we compose from a vertex
 *   array: `trapezoid`, `sector`, `triangle`, `ngon`, `star`, and the
 *   generic escape-hatch `polygon`. All of these require
 *   `PlacedPart.polygon` to be populated at template-create time.
 *
 * Renderer dispatch lives in `KonvaSheetRenderer.PartShape`. Any
 * shape in this union that does NOT have a first-class Konva
 * primitive falls through to the polygon `<Line closed points>`
 * path, then to `<Rect>` as a last-resort fallback.
 */
export type RenderShape =
  | "rect"
  | "circle"
  | "ellipse"
  | "ring"
  | "trapezoid"
  | "sector"
  | "triangle"
  | "ngon"
  | "star"
  | "polygon"

export interface PlacedPart {
  id: string
  shapeId: string
  partNumber?: string
  label: string
  renderShape: RenderShape
  specIndex: number

  /** Inches, sheet-space (post-rotation so Konva/PDF coords are final). */
  x: number
  y: number
  rotationRad: number

  width: number
  height: number

  diameter?: number
  topWidth?: number
  bottomWidth?: number
  innerRadius?: number
  outerRadius?: number
  arcDegrees?: number

  /** Actual placed polygon outer ring (inches, post-rotation). Present for non-rect shapes. */
  polygon?: Array<{ x: number; y: number }>
  /**
   * Inner hole loops (inches, post-rotation), if any. Each entry is a
   * single closed loop. Holes are voids — the operator does NOT cut
   * the hole's interior. Carried alongside `polygon` so hole-blind
   * consumers (thumbnails, area math, bbox math) stay correct without
   * needing to know about holes. Hole-aware consumers (Konva renderer,
   * PDF renderer, free-roam collision) read this field and paint /
   * test the cutouts.
   *
   * Mirrors the holes part of `rf_geom::PolygonWithHoles` /
   * `Placement.polygon.holes` from the Rust round-trip. Absent or
   * empty array → no holes.
   */
  holes?: Array<Array<{ x: number; y: number }>>
  /**
   * Pack polygon — the surface jagua collided on, when it differs
   * from `polygon` (today: the cone convex-hull overlay in default
   * packing). Visualizer paints this as a translucent overlay so
   * operators can see jagua's "mental model" of the shape.
   */
  packPolygon?: Array<{ x: number; y: number }>
  cutDirection?: SimpleCutDirection
  flipped?: boolean
  rotated90?: boolean
}

export interface LayoutRegion {
  x: number
  y: number
  width: number
  height: number
  polygon?: Array<{ x: number; y: number }>
}

export interface LayoutModel {
  /** Display width in inches (post-rotation — what the user sees on screen). */
  sheetWidth: number
  /** Display length in inches (post-rotation). */
  sheetLength: number

  parts: PlacedPart[]
  offcuts: LayoutRegion[]
  scrap: LayoutRegion[]

  placedCount: number
  overflowCount: number
  usedAreaSqFt: number
  reusableAreaSqFt: number
  scrapAreaSqFt: number
  fabScore: number

  source: "ts-nfp" | "rust-rf-layout"
  /**
   * `"offcut-extract"` marks a synthetic sheet hoisted from a parent
   * sheet's reusable offcut (≥ 40% of stock area). Plain layouts have
   * `undefined` here. Currently rendered as just the parent sheet —
   * the hoisting transform is a follow-up.
   */
  sheetKind?: "offcut-extract"
  /** Index of the parent sheet when `sheetKind === "offcut-extract"`. */
  parentSheetIndex?: number
  /**
   * Axis-aligned scrap rectangles below the reusable threshold,
   * surfaced separately for the "Show inscribed rects" debug overlay.
   * Polygon scrap (`scrap`) is the rendered red region; this array
   * holds dashed dark-red outlines on top.
   */
  debugScrapRects?: LayoutRegion[]
}

// ── Runtime guards ──────────────────────────────────────────────────────────

const RENDER_SHAPES: ReadonlySet<RenderShape> = new Set([
  "rect",
  "circle",
  "ellipse",
  "ring",
  "trapezoid",
  "sector",
  "triangle",
  "ngon",
  "star",
  "polygon",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isPoint(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

function isPointArray(value: unknown): value is Array<{ x: number; y: number }> {
  return Array.isArray(value) && value.every(isPoint)
}

function isHoleArray(value: unknown): value is Array<Array<{ x: number; y: number }>> {
  return Array.isArray(value) && value.every(isPointArray)
}

function hasOptionalFiniteNumber(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || isFiniteNumber(value[key])
}

function isLayoutRegion(value: unknown): value is LayoutRegion {
  if (!isRecord(value)) return false
  return (
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    (value.polygon === undefined || isPointArray(value.polygon))
  )
}

function isPlacedPart(value: unknown): value is PlacedPart {
  if (!isRecord(value)) return false
  const renderShape = value.renderShape
  return (
    typeof value.id === "string" &&
    typeof value.shapeId === "string" &&
    (value.partNumber === undefined || typeof value.partNumber === "string") &&
    typeof value.label === "string" &&
    typeof renderShape === "string" &&
    RENDER_SHAPES.has(renderShape as RenderShape) &&
    isFiniteNumber(value.specIndex) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.rotationRad) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    hasOptionalFiniteNumber(value, "diameter") &&
    hasOptionalFiniteNumber(value, "topWidth") &&
    hasOptionalFiniteNumber(value, "bottomWidth") &&
    hasOptionalFiniteNumber(value, "innerRadius") &&
    hasOptionalFiniteNumber(value, "outerRadius") &&
    hasOptionalFiniteNumber(value, "arcDegrees") &&
    (value.polygon === undefined || isPointArray(value.polygon)) &&
    (value.holes === undefined || isHoleArray(value.holes)) &&
    (value.packPolygon === undefined || isPointArray(value.packPolygon)) &&
    (value.flipped === undefined || typeof value.flipped === "boolean") &&
    (value.rotated90 === undefined || typeof value.rotated90 === "boolean")
  )
}

export function isLayoutModel(value: unknown): value is LayoutModel {
  if (!isRecord(value)) return false
  return (
    isFiniteNumber(value.sheetWidth) &&
    isFiniteNumber(value.sheetLength) &&
    Array.isArray(value.parts) &&
    value.parts.every(isPlacedPart) &&
    Array.isArray(value.offcuts) &&
    value.offcuts.every(isLayoutRegion) &&
    Array.isArray(value.scrap) &&
    value.scrap.every(isLayoutRegion) &&
    isFiniteNumber(value.placedCount) &&
    isFiniteNumber(value.overflowCount) &&
    isFiniteNumber(value.usedAreaSqFt) &&
    isFiniteNumber(value.reusableAreaSqFt) &&
    isFiniteNumber(value.scrapAreaSqFt) &&
    isFiniteNumber(value.fabScore) &&
    (value.source === "ts-nfp" || value.source === "rust-rf-layout") &&
    (value.sheetKind === undefined || value.sheetKind === "offcut-extract") &&
    (value.parentSheetIndex === undefined ||
      (isFiniteNumber(value.parentSheetIndex) &&
        Number.isInteger(value.parentSheetIndex) &&
        value.parentSheetIndex >= 0)) &&
    (value.debugScrapRects === undefined ||
      (Array.isArray(value.debugScrapRects) && value.debugScrapRects.every(isLayoutRegion)))
  )
}

export function isLayoutModelArray(value: unknown): value is LayoutModel[] {
  return Array.isArray(value) && value.length > 0 && value.every(isLayoutModel)
}

// ── Tolerant coercer for cut_history.layout_json (versioned reads) ──────────
//
// The strict `isLayoutModel` guard above is correct for in-memory data we just
// produced — but it's wrong for JSONB blobs that were saved by an OLDER
// `LayoutModel` shape. Every PR that adds or tightens a field invalidates
// every cut saved before that PR (the "saves but doesn't load" symptom).
//
// `coerceLayoutModel` is a forgiving deserializer: it requires only the
// load-bearing fields the renderer truly needs (sheet dimensions, valid
// parts) and back-fills sensible defaults for optional / new fields. The
// renderer itself is robust to missing optional fields — what it can't
// recover from is a wholesale guard rejection that returns `null` and
// makes it look like the cut had no layout at all.
//
// Use this on the LOAD path (cut history → render). Continue to use the
// strict `isLayoutModel` for fresh in-memory layouts where any deviation
// IS a bug worth noisy-failing.

function coercePoint(value: unknown): { x: number; y: number } | null {
  return isPoint(value) ? { x: value.x, y: value.y } : null
}

function coercePointArray(value: unknown): Array<{ x: number; y: number }> | undefined {
  if (!Array.isArray(value)) return undefined
  const points: Array<{ x: number; y: number }> = []
  for (const entry of value) {
    const p = coercePoint(entry)
    if (p) points.push(p)
  }
  return points.length > 0 ? points : undefined
}

function coerceHoleArray(value: unknown): Array<Array<{ x: number; y: number }>> | undefined {
  if (!Array.isArray(value)) return undefined
  const holes: Array<Array<{ x: number; y: number }>> = []
  for (const entry of value) {
    const ring = coercePointArray(entry)
    // Drop degenerate rings (< 3 vertices after coercion); the renderer
    // and PDF emitter both require `length >= 3` to draw a closed loop.
    if (ring && ring.length >= 3) holes.push(ring)
  }
  return holes.length > 0 ? holes : undefined
}

function coerceLayoutRegion(value: unknown): LayoutRegion | null {
  if (!isRecord(value)) return null
  if (
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height)
  ) {
    return null
  }
  const polygon = coercePointArray(value.polygon)
  return polygon
    ? { x: value.x, y: value.y, width: value.width, height: value.height, polygon }
    : { x: value.x, y: value.y, width: value.width, height: value.height }
}

function coerceLayoutRegionArray(value: unknown): LayoutRegion[] {
  if (!Array.isArray(value)) return []
  const regions: LayoutRegion[] = []
  for (const entry of value) {
    const r = coerceLayoutRegion(entry)
    if (r) regions.push(r)
  }
  return regions
}

function coerceOptionalNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined
}

function coercePlacedPart(value: unknown): PlacedPart | null {
  if (!isRecord(value)) return null
  // Required identity + geometry — without these the renderer cannot
  // place the part. `id` and `shapeId` get synthetic fallbacks because
  // earlier shapes used different naming conventions; the IDs are only
  // used for React keys and don't affect rendering.
  if (
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height)
  ) {
    return null
  }
  const renderShape: RenderShape =
    typeof value.renderShape === "string" && RENDER_SHAPES.has(value.renderShape as RenderShape)
      ? (value.renderShape as RenderShape)
      : "rect"
  const id = typeof value.id === "string" ? value.id : `coerced-part-${value.x}-${value.y}`
  const shapeId = typeof value.shapeId === "string" ? value.shapeId : id
  const label = typeof value.label === "string" ? value.label : ""
  const partNumber = typeof value.partNumber === "string" ? value.partNumber : undefined
  const specIndex = isFiniteNumber(value.specIndex) ? value.specIndex : 0
  const rotationRad = isFiniteNumber(value.rotationRad) ? value.rotationRad : 0

  const polygon = coercePointArray(value.polygon)
  const holes = coerceHoleArray(value.holes)
  const packPolygon = coercePointArray(value.packPolygon)

  return {
    id,
    shapeId,
    partNumber,
    label,
    renderShape,
    specIndex,
    x: value.x,
    y: value.y,
    rotationRad,
    width: value.width,
    height: value.height,
    diameter: coerceOptionalNumber(value.diameter),
    topWidth: coerceOptionalNumber(value.topWidth),
    bottomWidth: coerceOptionalNumber(value.bottomWidth),
    innerRadius: coerceOptionalNumber(value.innerRadius),
    outerRadius: coerceOptionalNumber(value.outerRadius),
    arcDegrees: coerceOptionalNumber(value.arcDegrees),
    polygon,
    holes,
    packPolygon,
    cutDirection:
      value.cutDirection === "vertical_split" ||
      value.cutDirection === "horizontal_split" ||
      value.cutDirection === "radial_split" ||
      value.cutDirection === "arc_bands" ||
      value.cutDirection === "wrap_panels" ||
      value.cutDirection === "wrap_bands"
        ? value.cutDirection
        : undefined,
    flipped: typeof value.flipped === "boolean" ? value.flipped : undefined,
    rotated90: typeof value.rotated90 === "boolean" ? value.rotated90 : undefined,
  }
}

export function coerceLayoutModel(value: unknown): LayoutModel | null {
  if (!isRecord(value)) return null
  // Sheet dimensions are the one true non-negotiable — without them
  // the renderer has no canvas to draw on.
  if (!isFiniteNumber(value.sheetWidth) || !isFiniteNumber(value.sheetLength)) {
    return null
  }

  const parts: PlacedPart[] = []
  if (Array.isArray(value.parts)) {
    for (const entry of value.parts) {
      const part = coercePlacedPart(entry)
      if (part) parts.push(part)
    }
  }

  const offcuts = coerceLayoutRegionArray(value.offcuts)
  const scrap = coerceLayoutRegionArray(value.scrap)
  const debugScrapRectsRaw = value.debugScrapRects
  const debugScrapRects = Array.isArray(debugScrapRectsRaw)
    ? coerceLayoutRegionArray(debugScrapRectsRaw)
    : undefined

  const source: "ts-nfp" | "rust-rf-layout" =
    value.source === "ts-nfp" ? "ts-nfp" : "rust-rf-layout"

  return {
    sheetWidth: value.sheetWidth,
    sheetLength: value.sheetLength,
    parts,
    offcuts,
    scrap,
    placedCount: isFiniteNumber(value.placedCount) ? value.placedCount : parts.length,
    overflowCount: isFiniteNumber(value.overflowCount) ? value.overflowCount : 0,
    usedAreaSqFt: isFiniteNumber(value.usedAreaSqFt) ? value.usedAreaSqFt : 0,
    reusableAreaSqFt: isFiniteNumber(value.reusableAreaSqFt) ? value.reusableAreaSqFt : 0,
    scrapAreaSqFt: isFiniteNumber(value.scrapAreaSqFt) ? value.scrapAreaSqFt : 0,
    fabScore: isFiniteNumber(value.fabScore) ? value.fabScore : 0,
    source,
    sheetKind: value.sheetKind === "offcut-extract" ? "offcut-extract" : undefined,
    parentSheetIndex:
      isFiniteNumber(value.parentSheetIndex) &&
      Number.isInteger(value.parentSheetIndex) &&
      value.parentSheetIndex >= 0
        ? value.parentSheetIndex
        : undefined,
    debugScrapRects: debugScrapRects && debugScrapRects.length > 0 ? debugScrapRects : undefined,
  }
}

export function coerceLayoutModelArray(value: unknown): LayoutModel[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const layouts: LayoutModel[] = []
  for (const entry of value) {
    const layout = coerceLayoutModel(entry)
    if (layout) layouts.push(layout)
  }
  return layouts.length > 0 ? layouts : null
}

// ── Normaliser ───────────────────────────────────────────────────────────────

function bandToRegion(b: OffcutBand): LayoutRegion {
  return { x: b.x, y: b.y, width: b.width, height: b.height, polygon: b.polygon }
}

// Map the PreviewItem.renderShape strings (from the Auto-nest
// NestingVisualizer pipeline) onto our RenderShape union. Keep this
// narrow — new shapes added for Free-roam's shape library don't
// need to round-trip through the Auto-nest preview path; they come
// in via `PartTemplate` → manual placements instead.
const RENDER_SHAPE_MAP: Record<string, RenderShape> = {
  rect: "rect",
  circle: "circle",
  trapezoid: "trapezoid",
  sector: "sector",
}

function itemToPlacedPart(
  item: PreviewItem,
  index: number,
  tagMap: Map<string, string>
): PlacedPart {
  const tagKey = item.specIndex != null ? String(item.specIndex) : String(index)
  const label = tagMap.get(tagKey) ?? tagKey
  const renderShape: RenderShape = RENDER_SHAPE_MAP[item.renderShape] ?? "rect"

  return {
    id: `item:${index}`,
    shapeId: item.partNumber ?? `spec-${item.specIndex ?? index}`,
    partNumber: item.partNumber,
    label,
    renderShape,
    specIndex: item.specIndex ?? 0,
    x: item.x,
    y: item.y,
    rotationRad: item.rotation ?? 0,
    width: item.width,
    height: item.height,
    diameter: item.diameter,
    topWidth: item.topWidth,
    bottomWidth: item.bottomWidth,
    innerRadius: item.innerRadius,
    outerRadius: item.outerRadius,
    arcDegrees: item.arcDegrees,
    polygon: item.placedPolygon,
    cutDirection: item.cutDirection,
    flipped: item.flipped,
    rotated90: item.rotated90,
  }
}

/**
 * Convert a NestingVisualizer preview (already post-rotation) into a LayoutModel.
 * `sheetW` / `sheetL` are the display dimensions in inches (post-rotation).
 * `tagMap` is keyed by specIndex string → tag letter or part number.
 */
export function fromPreviewToLayoutModel(
  preview: SimplePartPreview,
  sheetW: number,
  sheetL: number,
  tagMap: Map<string, string>
): LayoutModel {
  return {
    sheetWidth: sheetW,
    sheetLength: sheetL,
    parts: preview.items.map((item, i) => itemToPlacedPart(item, i, tagMap)),
    offcuts: preview.offcutBands.map(bandToRegion),
    scrap: preview.scrapBands.map(bandToRegion),
    placedCount: preview.unitsCompleted,
    overflowCount: preview.overflowUnits,
    usedAreaSqFt: preview.usedArea / 144,
    reusableAreaSqFt: preview.reusableArea / 144,
    scrapAreaSqFt: preview.scrapArea / 144,
    fabScore: (preview.fabricationScore ?? 0) / 100,
    source: "ts-nfp",
  }
}

// ── Frozen-layout restore ───────────────────────────────────────────────────

function layoutPartToPreviewItem(part: PlacedPart): PreviewItem {
  const renderShape =
    part.renderShape === "circle" ||
    part.renderShape === "trapezoid" ||
    part.renderShape === "sector"
      ? part.renderShape
      : "rect"

  return {
    renderShape,
    label: part.label,
    specIndex: part.specIndex,
    partNumber: part.partNumber,
    x: part.x,
    y: part.y,
    width: part.width,
    height: part.height,
    flipped: part.flipped,
    rotated90: part.rotated90,
    cutDirection: part.cutDirection,
    diameter: part.diameter,
    topWidth: part.topWidth,
    bottomWidth: part.bottomWidth,
    innerRadius: part.innerRadius,
    outerRadius: part.outerRadius,
    arcDegrees: part.arcDegrees,
    rotation: part.rotationRad,
    placedPolygon: part.polygon,
  }
}

function boundsForItems(items: PreviewItem[]) {
  if (items.length === 0) return { occupiedWidth: 0, occupiedHeight: 0 }
  // Single-pass reduce — `Math.min(...arr)` would spread every element onto
  // the call stack and blow up on large layouts (CR finding on PR #133).
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const item of items) {
    if (item.x < minX) minX = item.x
    if (item.y < minY) minY = item.y
    const right = item.x + item.width
    const bottom = item.y + item.height
    if (right > maxX) maxX = right
    if (bottom > maxY) maxY = bottom
  }
  return {
    occupiedWidth: Math.max(0, maxX - minX),
    occupiedHeight: Math.max(0, maxY - minY),
  }
}

function previewShapeForLayout(layout: LayoutModel): RectLikePreview["renderShape"] {
  const shapes = new Set(layout.parts.map((part) => part.renderShape))
  if (shapes.size === 1 && shapes.has("trapezoid")) return "trapezoid"
  if (shapes.size === 1 && shapes.has("sector")) return "sector"
  return "rect"
}

export function fromLayoutModelToPreview(layout: LayoutModel): SimplePartPreview {
  const items = layout.parts.map(layoutPartToPreviewItem)
  const stockArea = layout.sheetWidth * layout.sheetLength
  const usedArea = layout.usedAreaSqFt * 144
  const reusableArea = layout.reusableAreaSqFt * 144
  const scrapArea = layout.scrapAreaSqFt * 144
  const wasteArea = reusableArea + scrapArea
  const bounds = boundsForItems(items)
  const piecesPerUnit =
    layout.placedCount > 0 ? Math.max(1, Math.round(items.length / layout.placedCount)) : 0

  return {
    renderShape: previewShapeForLayout(layout),
    strategyName: "Restored layout",
    strategyNote: "Frozen from the saved cut history record.",
    placementMode: "origin",
    wasteMode: "bands",
    cutPlanTitle: "",
    cutSteps: [],
    requestedUnits: layout.placedCount + layout.overflowCount,
    unitsCompleted: layout.placedCount,
    overflowUnits: layout.overflowCount,
    piecesShown: items.length,
    piecesPerUnit,
    usedArea,
    wasteArea,
    wastePct: stockArea > 0 ? (wasteArea / stockArea) * 100 : 100,
    reusableArea,
    scrapArea,
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
    items,
    offcutBands: layout.offcuts,
    scrapBands: layout.scrap,
    fabricationScore: layout.fabScore * 100,
    placements: items,
    label: items[0]?.label ?? "",
  }
}

export function fromLayoutModelsToMultiSheetResult(layouts: LayoutModel[]): MultiSheetResult {
  const sheets = layouts.map((layout, index) => ({
    sheetIndex: index,
    preview: fromLayoutModelToPreview(layout),
    isPartial: false,
  }))

  return {
    sheets,
    totalUnitsCompleted: layouts.reduce((sum, layout) => sum + layout.placedCount, 0),
    totalUsedArea: layouts.reduce((sum, layout) => sum + layout.usedAreaSqFt * 144, 0),
    totalReusableArea: layouts.reduce((sum, layout) => sum + layout.reusableAreaSqFt * 144, 0),
    totalScrapArea: layouts.reduce((sum, layout) => sum + layout.scrapAreaSqFt * 144, 0),
    totalStockArea: layouts.reduce(
      (sum, layout) => sum + layout.sheetWidth * layout.sheetLength,
      0
    ),
    remainingOverflow: layouts.reduce((sum, layout) => sum + layout.overflowCount, 0),
    avgFabScore:
      layouts.length > 0
        ? Math.round(
            layouts.reduce((sum, layout) => sum + layout.fabScore * 100, 0) / layouts.length
          )
        : 0,
  }
}
