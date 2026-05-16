// Narrowed DXF AST.
//
// dxf-parser yields a weakly-typed `IDxf` shape full of variants we
// don't support in PR1 (3D, mesh, splines, dimensions, blocks, etc.).
// We translate that into a discriminated union at the `parseDxf`
// boundary so every consumer downstream operates on a known set of
// cases. Unsupported entities collapse into `UnsupportedEntity` with
// a reason code so the Review dialog can surface specific copy.

import type { Point2D, PolygonWithHoles, UnitSystem } from "@/src/application/packing/types"

export type { Point2D, PolygonWithHoles, UnitSystem }

export interface LineEntity {
  kind: "line"
  layer: string
  start: Point2D
  end: Point2D
}

export interface LwPolylineVertex extends Point2D {
  bulge: number
}

export interface LwPolylineEntity {
  kind: "lwpolyline"
  layer: string
  closed: boolean
  vertices: LwPolylineVertex[]
}

export interface PolylineVertex extends Point2D {
  bulge: number
}

export interface PolylineEntity {
  kind: "polyline"
  layer: string
  closed: boolean
  vertices: PolylineVertex[]
}

export interface ArcEntity {
  kind: "arc"
  layer: string
  center: Point2D
  radius: number
  startAngleDeg: number
  endAngleDeg: number
}

export interface CircleEntity {
  kind: "circle"
  layer: string
  center: Point2D
  radius: number
}

export interface EllipseEntity {
  kind: "ellipse"
  layer: string
  center: Point2D
  majorAxisEnd: Point2D
  axisRatio: number
  startParam: number
  endParam: number
}

export interface SplineEntity {
  kind: "spline"
  layer: string
  controlPoints: Point2D[]
  knots: number[]
  degree: number
  closed: boolean
  weights?: number[]
}

/**
 * Reason codes for entities we recognise but cannot process.
 * The Review dialog renders each reason verbatim as operator copy.
 */
export type UnsupportedReason =
  | "polyline-curve-fit"
  | "polyline-spline-fit"
  | "polyline-3d"
  | "polyline-3d-mesh"
  | "polyline-polyface-mesh"
  | "polyline-not-closed"
  | "lwpolyline-not-closed"
  | "spline-rational-not-supported"
  | "spline-malformed"
  | "entity-type-unsupported"

export interface UnsupportedEntity {
  kind: "unsupported"
  layer: string
  originalType: string
  reason: UnsupportedReason
}

export type DxfEntity =
  | LineEntity
  | LwPolylineEntity
  | PolylineEntity
  | ArcEntity
  | CircleEntity
  | EllipseEntity
  | SplineEntity
  | UnsupportedEntity

export interface DxfDocument {
  /** $INSUNITS code if present, otherwise undefined. */
  insUnits: number | undefined
  entities: DxfEntity[]
}

export interface DxfImportedPart {
  partNumber: string
  polygon: PolygonWithHoles
  quantity: number
  units: UnitSystem
  sourceFile: string
}

export interface RejectedEntity {
  layer: string
  originalType: string
  reason: UnsupportedReason
}
