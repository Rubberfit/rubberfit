import type { Point2D, ShapeSpec } from "@/src/application/packing/types"

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
}

export interface PlacementView {
  items: PlacementViewItem[]
  bins: Record<string, PlacementViewBin>
  placedCount: number
  overflowCount: number
  totalUsedArea: number
  totalWasteArea: number
}
