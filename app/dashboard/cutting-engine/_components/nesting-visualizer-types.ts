// Types and interfaces for NestingVisualizer
import type { LayoutModel } from "./layout-model"

export type ShapeType = "rect" | "circle" | "cone"
export type GrainDir = "none" | "width" | "length"
export type DiagDir = "ltr" | "rtl"
export type StratMethod = "rect" | "diag"
export type SimplePartType = "rectangle" | "circle" | "cylinder" | "cone" | "trapezoid"
export type SimpleCutDirection =
  | "vertical_split"
  | "horizontal_split"
  | "radial_split"
  | "arc_bands"
  | "wrap_panels"
  | "wrap_bands"

export interface SimplePartSpec {
  partType: SimplePartType
  quantity: number
  cutDirection?: SimpleCutDirection
  cutRatios?: number[]
  width?: number
  length?: number
  diameter?: number
  height?: number
  topWidth?: number
  bottomWidth?: number
  innerRadius?: number
  outerRadius?: number
  arcDegrees?: number
  partNumber?: string
  /**
   * Stable index of this spec within the user's original `simpleParts` array.
   * Set at the cut-planner entry point so that `PreviewItem.specIndex` (which
   * keys the tag map) survives subset filtering — overflow regenerate, gap-fill,
   * and label-based reconciliation — without collapsing distinct specs that
   * share a display label. Optional; downstream code falls back to local
   * position when undefined (preserves single-spec and free-roam call sites).
   * See GitHub issue #121.
   */
  _originalSpecIndex?: number
}

export interface Strategy {
  id: string
  name: string
  sub: string
  method: StratMethod
  cutW: number
  cutH: number
  primaryDir: "horizontal" | "vertical"
  diagType?: "corner" | "custom"
  diagAngle?: number
  ddir?: DiagDir
  steps: string[]
  icon: string
}

export interface ScoredStrategy extends Strategy {
  cols: number
  rows: number
  rects: number
  pieces: number
  waste: number
  vCuts: number
  hCuts: number
  score: number
  reasons: { p: "p" | "w" | "f"; t: string }[]
}

/**
 * One reusable offcut rectangle extracted from the sheet. Emitted
 * alongside the aggregate metrics so downstream consumers (e.g.
 * the cut-recording route) can spawn one inventory row per piece
 * instead of one aggregate strip. Dims in inches.
 */
export interface OffcutPieceMetric {
  widthIn: number
  lengthIn: number
  /** Convenience square-footage so consumers don't redo /144. */
  areaSqft: number
}

export interface SimpleCutMetrics {
  partsCompleted: number
  cutPieces: number
  materialUsedSqFt: number
  reusableOffsetSqFt: number
  scrapSqFt: number
  fabScore: number
  /**
   * Per-piece offcut geometry. Empty when the layout has no
   * reusable offcut. Across multi-sheet layouts this is the
   * union of every sheet's reusable bands.
   */
  offcutPieces: OffcutPieceMetric[]
}

/**
 * Dev-only diagnostic overlays painted on top of the auto-nest SVG.
 *
 * Both fields default off; the toggle UI and the renderer's overlay
 * branch are gated on `process.env.NODE_ENV === "development"` so the
 * production bundle ships zero overlay code.
 *
 * - `showAabb`: violet dashed AABB outline per placed part, emerald
 *   dashed outline per reusable offcut. Lets devs verify rotation +
 *   placement transforms against polygon vertices.
 * - `showScrapRects`: dashed dark-red outline over each rectangle the
 *   Rust extractor classified below the reusable threshold (sourced
 *   from `LayoutModel.debugScrapRects`).
 */
export interface DebugOverlayOptions {
  showAabb: boolean
  showScrapRects: boolean
}

export interface NestingVisualizerProps {
  defaultRollWidth?: number
  defaultRollLength?: number
  defaultCutWidth?: number
  defaultCutHeight?: number
  defaultQty?: number
  simplePart?: SimplePartSpec
  simpleParts?: SimplePartSpec[]
  /**
   * Saved post-rotation layouts from `cut_history.layout_json.auto.layouts`.
   * When provided, the visualizer renders these exact sheets and bypasses
   * sync/async packing so reloads do not drift from the saved cut.
   */
  frozenLayouts?: LayoutModel[]
  /**
   * Pack-gate status from `usePackGate`. Drives whether the visualizer
   * runs the TS preview generators + Rust optimizer or shows an empty
   * sheet waiting for the operator to press Pack.
   *
   * - `idle`: empty sheet ("Ready to pack" prompt).
   * - `packing`: loader.
   * - `done`: full preview + optimized layout.
   *
   * Defaults to `"done"` when omitted so legacy callers (free-roam,
   * tests, screenshots) keep eager-render behaviour. New page-level
   * callers should pass the gate so input edits don't trigger packs.
   */
  packGateStatus?: "idle" | "packing" | "done"
  onMetricsChange?: (metrics: SimpleCutMetrics) => void
  onTagMapChange?: (tagMap: Map<string, string>) => void
  debugOverlays?: DebugOverlayOptions
}

export interface SimpleRectLayout {
  orientation: "default" | "rotated"
  pieceW: number
  pieceH: number
  cols: number
  rows: number
  rowCounts: number[]
  capacity: number
  placed: number
  overflow: number
  usedArea: number
  wasteArea: number
  wastePct: number
  reusableArea: number
  scrapArea: number
  reusablePieces: number
}

export interface SimpleCircleLayout {
  positions: ShapePlacement[]
  blankSize: number
  capacity: number
  placed: number
  overflow: number
  usedArea: number
  wasteArea: number
  wastePct: number
}

export type SimplePreviewShape = "rect" | "circle" | "trapezoid" | "sector"

export interface ShapePlacement {
  x: number
  y: number
  width: number
  height: number
  flipped?: boolean
  rotated90?: boolean
}

export interface OffcutBand {
  x: number
  y: number
  width: number
  height: number
  /** For NFP layouts: actual polygon outline of the free region */
  polygon?: Array<{ x: number; y: number }>
}

export interface PackedShapeLayout {
  positions: ShapePlacement[]
  capacity: number
  placed: number
  overflow: number
  occupiedWidth: number
  occupiedHeight: number
}

export interface PackedPreviewItemsResult {
  items: PreviewItem[]
  usedArea: number
  occupiedWidth: number
  occupiedHeight: number
  freeRects?: OffcutBand[]
}

export interface CutPlanStep {
  title: string
  detail: string
}

export interface PreviewItem extends ShapePlacement {
  renderShape: SimplePreviewShape
  label: string
  /** Index of the originating spec in the simpleParts array (used for unique tag assignment) */
  specIndex?: number
  /** Part number from uploaded cut list (e.g. "G2"); used as tag when available */
  partNumber?: string
  cutDirection?: SimpleCutDirection
  diameter?: number
  topWidth?: number
  bottomWidth?: number
  innerRadius?: number
  outerRadius?: number
  arcDegrees?: number
  /** NFP solver rotation in radians (0 for heuristic placements) */
  rotation?: number
  /** Pre-computed polygon vertices (rotated + translated) from NFP solver */
  placedPolygon?: Array<{ x: number; y: number }>
}

export interface PreviewSection {
  start: number
  end: number
  label: string
  item: PreviewItem & { usedArea: number }
}

export interface SimplePreviewBase {
  renderShape: SimplePreviewShape
  strategyName: string
  strategyNote: string
  cutDirection?: SimpleCutDirection
  cutRatios?: number[]
  cutBreakpoints?: number[]
  cutLabels?: string[]
  profileItem?: PreviewItem
  sections?: PreviewSection[]
  placementMode: "origin" | "center"
  wasteMode: "bands" | "summary"
  cutPlanTitle: string
  cutSteps: CutPlanStep[]
  requestedUnits: number
  unitsCompleted: number
  overflowUnits: number
  piecesShown: number
  piecesPerUnit: number
  usedArea: number
  wasteArea: number
  wastePct: number
  reusableArea: number
  scrapArea: number
  occupiedWidth: number
  occupiedHeight: number
  items: PreviewItem[]
  offcutBands: OffcutBand[]
  scrapBands: OffcutBand[]
  fabricationScore?: number
  fabricationBreakdown?: {
    wasteScore: number
    reusableScore: number
    seamScore: number
    nestingScore: number
  }
}

export interface RectLikePreview extends SimplePreviewBase {
  renderShape: "rect" | "trapezoid" | "sector"
  placements: ShapePlacement[]
  label: string
  topWidth?: number
  bottomWidth?: number
  height?: number
  innerRadius?: number
  outerRadius?: number
  arcDegrees?: number
}

export interface CirclePreview extends SimplePreviewBase {
  renderShape: "circle"
  layout: SimpleCircleLayout
  diameter: number
}

export type SimplePartPreview = RectLikePreview | CirclePreview

export interface SheetPreview {
  sheetIndex: number
  preview: SimplePartPreview
  isPartial: boolean
}

export interface MultiSheetResult {
  sheets: SheetPreview[]
  totalUnitsCompleted: number
  totalUsedArea: number
  totalReusableArea: number
  totalScrapArea: number
  totalStockArea: number
  remainingOverflow: number
  avgFabScore: number
}

export type PreviewPackSort = "area" | "height" | "width" | "max-edge"

export const MIN_REUSABLE_OFFCUT_WIDTH = 11.5
export const MIN_REUSABLE_OFFCUT_HEIGHT = 12
export const MIN_REUSABLE_STRIP_WIDTH = 6
export const MIN_REUSABLE_STRIP_LENGTH = 24
