import type { ClassifiedOffcut, Point2D, ShapeSpec } from "@/src/application/packing/types"

export type RenderShape = "rect" | "circle" | "trapezoid" | "sector" | "ngon" | "polygon"

export interface PlacementViewItem {
  shapeId: string
  instanceIndex: number
  binId: string
  x: number
  y: number
  rotationRad: number
  width: number
  height: number
  polygon: Point2D[]
  shapeSpec?: ShapeSpec
  renderShape: RenderShape
  difficulty?: number
  /** Echo of the source `Part.tag`. Untagged parts yield undefined. */
  tag?: string
  /** Pack polygon when it differs from `polygon` (e.g. cone convex hull). */
  packPolygon?: Point2D[]
}

export interface PlacementViewBin {
  binId: string
  width: number
  height: number
  items: PlacementViewItem[]
  usedArea: number
  wasteArea: number
  occupiedWidth: number
  occupiedHeight: number
  efficiency: number
  /** scrap_ratio == 1.0 - efficiency, surfaced from the Rust pipeline. */
  scrapRatio: number
  /**
   * Bin polygon minus union of placed parts. CCW-wound, bin-local
   * coords. Renderers paint these as scrap polygons for irregular waste.
   */
  freeRegions: Point2D[][]
  /**
   * Axis-aligned reusable / scrap rectangles inscribed inside the
   * `freeRegions`. Reusable rendered amber, scrap rendered red.
   */
  offcuts: ClassifiedOffcut[]
}

export interface PlacementView {
  items: PlacementViewItem[]
  bins: Record<string, PlacementViewBin>
  placedCount: number
  overflowCount: number
  totalUsedArea: number
  totalWasteArea: number
  /** Workspace-wide utilization, 0..1. */
  overallDensity: number
  runTimeMs?: number
}
