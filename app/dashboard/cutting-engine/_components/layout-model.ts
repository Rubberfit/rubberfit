import type { SimplePartPreview, OffcutBand, PreviewItem } from "./nesting-visualizer-types"
import type { SimpleCutDirection } from "./nesting-visualizer-types"

export type RenderShape = "rect" | "circle" | "trapezoid" | "sector"

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

  /** Actual placed polygon vertices (inches, post-rotation). Present for non-rect shapes. */
  polygon?: Array<{ x: number; y: number }>
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

  source: "ts-nfp"
}

// ── Normaliser ───────────────────────────────────────────────────────────────

function bandToRegion(b: OffcutBand): LayoutRegion {
  return { x: b.x, y: b.y, width: b.width, height: b.height, polygon: b.polygon }
}

const RENDER_SHAPE_MAP: Record<string, RenderShape> = {
  circle: "circle",
  trapezoid: "trapezoid",
  sector: "sector",
  rect: "rect",
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
