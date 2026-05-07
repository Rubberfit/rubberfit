// Narrowed DXF AST.
//
// dxf-parser yields a weakly-typed `IDxf` shape full of variants we
// don't support in PR1 (3D, mesh, splines, dimensions, blocks, etc.).
// We translate that into a discriminated union at the `parseDxf`
// boundary so every consumer downstream operates on a known set of
// cases. Unsupported entities collapse into `UnsupportedEntity` with
// a reason code so the Review dialog can surface specific copy.

import type { Point2D, UnitSystem } from "@/src/application/packing/types"

export type { Point2D, UnitSystem }

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

/**
 * Reason codes for entities we recognise but cannot process in PR1.
 * The Review dialog renders each reason verbatim as operator copy.
 */
export type UnsupportedReason =
  | "curves-deferred-to-pr2"
  | "polyline-curve-fit"
  | "polyline-spline-fit"
  | "polyline-3d"
  | "polyline-3d-mesh"
  | "polyline-polyface-mesh"
  | "polyline-not-closed"
  | "polyline-contains-bulge"
  | "lwpolyline-not-closed"
  | "entity-type-unsupported"

export interface UnsupportedEntity {
  kind: "unsupported"
  layer: string
  originalType: string
  reason: UnsupportedReason
}

export type DxfEntity = LineEntity | LwPolylineEntity | PolylineEntity | UnsupportedEntity

export interface DxfDocument {
  /** $INSUNITS code if present, otherwise undefined. */
  insUnits: number | undefined
  entities: DxfEntity[]
}

export interface DxfImportedPart {
  partNumber: string
  polygon: Point2D[]
  quantity: number
  units: UnitSystem
  sourceFile: string
}

export interface RejectedEntity {
  layer: string
  originalType: string
  reason: UnsupportedReason
}
