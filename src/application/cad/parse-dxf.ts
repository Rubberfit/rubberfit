// Parse a raw DXF text blob into our narrowed AST.
//
// dxf-parser hands us a weakly-typed IDxf with every entity kind it
// knows about. We narrow LINE / LWPOLYLINE / POLYLINE into the
// discriminated union from `dxf-types.ts` and collapse every
// unsupported variant into `UnsupportedEntity` with a specific reason
// so the Review dialog can render targeted operator copy.
//
// PR1 explicitly rejects: ARC / CIRCLE / SPLINE / ELLIPSE (curves,
// deferred to PR2), POLYLINE with curve-fit / spline-fit / 3D / mesh
// / polyface bits, and unclosed loops.
//
// This is the only place in the CAD pipeline where `as` casts on the
// dxf-parser response are permitted — system boundary (per
// CLAUDE.md TS rules).

import DxfParser, {
  type IDxf,
  type IEntity,
  type ILineEntity,
  type ILwpolylineEntity,
  type IPolylineEntity,
} from "dxf-parser"

import type {
  DxfDocument,
  DxfEntity,
  LineEntity,
  LwPolylineEntity,
  LwPolylineVertex,
  PolylineEntity,
  PolylineVertex,
  UnsupportedEntity,
  UnsupportedReason,
} from "./dxf-types"

const CURVE_TYPES = new Set(["ARC", "CIRCLE", "SPLINE", "ELLIPSE"])

export class DxfParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DxfParseError"
  }
}

export function parseDxf(text: string): DxfDocument {
  const parser = new DxfParser()
  let parsed: IDxf | null
  try {
    parsed = parser.parseSync(text)
  } catch (error) {
    throw new DxfParseError(
      `Failed to parse DXF: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (!parsed) {
    throw new DxfParseError("Failed to parse DXF: empty document")
  }

  const insUnitsRaw = parsed.header?.["$INSUNITS"]
  const insUnits = typeof insUnitsRaw === "number" ? insUnitsRaw : undefined

  const entities: DxfEntity[] = (parsed.entities ?? []).map(narrowEntity)

  return { insUnits, entities }
}

function narrowEntity(entity: IEntity): DxfEntity {
  const layer = entity.layer ?? "0"
  const originalType = entity.type ?? "UNKNOWN"

  switch (originalType) {
    case "LINE":
      return narrowLine(entity as ILineEntity, layer)
    case "LWPOLYLINE":
      return narrowLwPolyline(entity as ILwpolylineEntity, layer)
    case "POLYLINE":
      return narrowPolyline(entity as IPolylineEntity, layer)
    case "ARC":
    case "CIRCLE":
    case "SPLINE":
    case "ELLIPSE":
      return unsupported(layer, originalType, "curves-deferred-to-pr2")
    default:
      if (CURVE_TYPES.has(originalType)) {
        return unsupported(layer, originalType, "curves-deferred-to-pr2")
      }
      return unsupported(layer, originalType, "entity-type-unsupported")
  }
}

function narrowLine(entity: ILineEntity, layer: string): LineEntity | UnsupportedEntity {
  const verts = entity.vertices ?? []
  if (verts.length < 2) {
    return unsupported(layer, "LINE", "entity-type-unsupported")
  }
  return {
    kind: "line",
    layer,
    start: { x: verts[0].x, y: verts[0].y },
    end: { x: verts[1].x, y: verts[1].y },
  }
}

function narrowLwPolyline(
  entity: ILwpolylineEntity,
  layer: string
): LwPolylineEntity | UnsupportedEntity {
  if (!entity.shape) {
    return unsupported(layer, "LWPOLYLINE", "lwpolyline-not-closed")
  }
  const vertices: LwPolylineVertex[] = (entity.vertices ?? []).map((v) => ({
    x: v.x,
    y: v.y,
    bulge: v.bulge ?? 0,
  }))
  return { kind: "lwpolyline", layer, closed: true, vertices }
}

function narrowPolyline(
  entity: IPolylineEntity,
  layer: string
): PolylineEntity | UnsupportedEntity {
  if (entity.includesCurveFitVertices) {
    return unsupported(layer, "POLYLINE", "polyline-curve-fit")
  }
  if (entity.includesSplineFitVertices) {
    return unsupported(layer, "POLYLINE", "polyline-spline-fit")
  }
  if (entity.is3dPolyline) {
    return unsupported(layer, "POLYLINE", "polyline-3d")
  }
  if (entity.is3dPolygonMesh) {
    return unsupported(layer, "POLYLINE", "polyline-3d-mesh")
  }
  if (entity.isPolyfaceMesh) {
    return unsupported(layer, "POLYLINE", "polyline-polyface-mesh")
  }
  if (!entity.shape) {
    return unsupported(layer, "POLYLINE", "polyline-not-closed")
  }
  const vertices: PolylineVertex[] = (entity.vertices ?? []).map((v) => ({
    x: v.x,
    y: v.y,
    bulge: v.bulge ?? 0,
  }))
  return { kind: "polyline", layer, closed: true, vertices }
}

function unsupported(
  layer: string,
  originalType: string,
  reason: UnsupportedReason
): UnsupportedEntity {
  return { kind: "unsupported", layer, originalType, reason }
}
