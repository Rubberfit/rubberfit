// Parse a raw DXF text blob into our narrowed AST.
//
// dxf-parser hands us a weakly-typed IDxf with every entity kind it
// knows about. We narrow LINE / LWPOLYLINE / POLYLINE / ARC / CIRCLE
// / ELLIPSE / SPLINE into the discriminated union from `dxf-types.ts`
// and collapse every unsupported variant into `UnsupportedEntity` with
// a specific reason so the Review dialog can render targeted operator
// copy.
//
// Curve entities preserve their parametric definition for downstream
// tessellation (`connect-loops.ts` -> `tessellate-curves.ts`).
// Polyline bulges are preserved on each vertex — they're tessellated
// in `connect-loops.ts`, not rejected here.
//
// Angle conventions in the narrowed AST:
//   - ARC: degrees CCW from +X (matches DXF group codes 50/51).
//     dxf-parser stores these as radians internally; we convert back.
//   - ELLIPSE: start/end PARAMETERS in radians (DXF group codes 41/42
//     are already radians for ELLIPSE, no conversion needed).
//
// This is the only place in the CAD pipeline where `as` casts on the
// dxf-parser response are permitted — system boundary (per
// CLAUDE.md TS rules).

import DxfParser, {
  type IArcEntity,
  type ICircleEntity,
  type IDxf,
  type IEllipseEntity,
  type IEntity,
  type ILineEntity,
  type ILwpolylineEntity,
  type IPolylineEntity,
  type ISplineEntity,
} from "dxf-parser"

import type {
  ArcEntity,
  CircleEntity,
  DxfDocument,
  DxfEntity,
  EllipseEntity,
  LineEntity,
  LwPolylineEntity,
  LwPolylineVertex,
  PolylineEntity,
  PolylineVertex,
  SplineEntity,
  UnsupportedEntity,
  UnsupportedReason,
} from "./dxf-types"

const RAD_TO_DEG = 180 / Math.PI

interface SplineControlPoint {
  x: number
  y: number
}

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
      return narrowArc(entity as IArcEntity, layer)
    case "CIRCLE":
      return narrowCircle(entity as ICircleEntity, layer)
    case "ELLIPSE":
      return narrowEllipse(entity as IEllipseEntity, layer)
    case "SPLINE":
      return narrowSpline(entity as ISplineEntity, layer)
    default:
      return unsupported(layer, originalType, "entity-type-unsupported")
  }
}

function narrowLine(entity: ILineEntity, layer: string): LineEntity | UnsupportedEntity {
  const verts = entity.vertices ?? []
  if (verts.length < 2) {
    return unsupported(layer, "LINE", "entity-type-unsupported")
  }
  const [a, b] = verts
  if (
    !Number.isFinite(a.x) ||
    !Number.isFinite(a.y) ||
    !Number.isFinite(b.x) ||
    !Number.isFinite(b.y)
  ) {
    return unsupported(layer, "LINE", "entity-type-unsupported")
  }
  return {
    kind: "line",
    layer,
    start: { x: a.x, y: a.y },
    end: { x: b.x, y: b.y },
  }
}

function narrowLwPolyline(
  entity: ILwpolylineEntity,
  layer: string
): LwPolylineEntity | UnsupportedEntity {
  if (!entity.shape) {
    return unsupported(layer, "LWPOLYLINE", "lwpolyline-not-closed")
  }
  const rawVerts = entity.vertices ?? []
  const vertices: LwPolylineVertex[] = []
  for (const v of rawVerts) {
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) {
      return unsupported(layer, "LWPOLYLINE", "entity-type-unsupported")
    }
    // Non-finite bulge (NaN/Infinity) would poison `tessellateBulge`
    // downstream; coerce to 0 (straight-line segment) as a safe
    // degradation rather than rejecting the whole entity.
    const bulge = Number.isFinite(v.bulge) ? (v.bulge as number) : 0
    vertices.push({ x: v.x, y: v.y, bulge })
  }
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
  const rawVerts = entity.vertices ?? []
  const vertices: PolylineVertex[] = []
  for (const v of rawVerts) {
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) {
      return unsupported(layer, "POLYLINE", "entity-type-unsupported")
    }
    // Non-finite bulge (NaN/Infinity) would poison `tessellateBulge`
    // downstream; coerce to 0 (straight-line segment) as a safe
    // degradation rather than rejecting the whole entity.
    const bulge = Number.isFinite(v.bulge) ? (v.bulge as number) : 0
    vertices.push({ x: v.x, y: v.y, bulge })
  }
  return { kind: "polyline", layer, closed: true, vertices }
}

function narrowArc(entity: IArcEntity, layer: string): ArcEntity | UnsupportedEntity {
  const center = entity.center
  if (
    !center ||
    typeof center.x !== "number" ||
    typeof center.y !== "number" ||
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y)
  ) {
    return unsupported(layer, "ARC", "entity-type-unsupported")
  }
  if (typeof entity.radius !== "number" || !(entity.radius > 0)) {
    return unsupported(layer, "ARC", "entity-type-unsupported")
  }
  if (
    typeof entity.startAngle !== "number" ||
    typeof entity.endAngle !== "number" ||
    !Number.isFinite(entity.startAngle) ||
    !Number.isFinite(entity.endAngle)
  ) {
    return unsupported(layer, "ARC", "entity-type-unsupported")
  }
  // dxf-parser converts DXF group codes 50/51 (degrees) to radians on read.
  // Our AST contract is degrees, so convert back.
  return {
    kind: "arc",
    layer,
    center: { x: center.x, y: center.y },
    radius: entity.radius,
    startAngleDeg: entity.startAngle * RAD_TO_DEG,
    endAngleDeg: entity.endAngle * RAD_TO_DEG,
  }
}

function narrowCircle(entity: ICircleEntity, layer: string): CircleEntity | UnsupportedEntity {
  const center = entity.center
  if (
    !center ||
    typeof center.x !== "number" ||
    typeof center.y !== "number" ||
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y)
  ) {
    return unsupported(layer, "CIRCLE", "entity-type-unsupported")
  }
  if (typeof entity.radius !== "number" || !(entity.radius > 0)) {
    return unsupported(layer, "CIRCLE", "entity-type-unsupported")
  }
  return {
    kind: "circle",
    layer,
    center: { x: center.x, y: center.y },
    radius: entity.radius,
  }
}

function narrowEllipse(entity: IEllipseEntity, layer: string): EllipseEntity | UnsupportedEntity {
  const center = entity.center
  const major = entity.majorAxisEndPoint
  if (
    !center ||
    typeof center.x !== "number" ||
    typeof center.y !== "number" ||
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y)
  ) {
    return unsupported(layer, "ELLIPSE", "entity-type-unsupported")
  }
  if (
    !major ||
    typeof major.x !== "number" ||
    typeof major.y !== "number" ||
    !Number.isFinite(major.x) ||
    !Number.isFinite(major.y)
  ) {
    return unsupported(layer, "ELLIPSE", "entity-type-unsupported")
  }
  if (typeof entity.axisRatio !== "number" || !(entity.axisRatio > 0)) {
    return unsupported(layer, "ELLIPSE", "entity-type-unsupported")
  }
  // DXF group codes 41/42 for ELLIPSE are parameters in radians along the
  // parametric ellipse (not the geometric angle from center). dxf-parser
  // does not convert these — they pass through as-is.
  const startParam = entity.startAngle ?? 0
  const endParam = entity.endAngle ?? 2 * Math.PI
  if (!Number.isFinite(startParam) || !Number.isFinite(endParam)) {
    return unsupported(layer, "ELLIPSE", "entity-type-unsupported")
  }
  return {
    kind: "ellipse",
    layer,
    center: { x: center.x, y: center.y },
    majorAxisEnd: { x: major.x, y: major.y },
    axisRatio: entity.axisRatio,
    startParam,
    endParam,
  }
}

function narrowSpline(entity: ISplineEntity, layer: string): SplineEntity | UnsupportedEntity {
  const rawControls = entity.controlPoints ?? []
  const controlPoints: SplineControlPoint[] = []
  for (const p of rawControls) {
    if (
      !p ||
      typeof p.x !== "number" ||
      typeof p.y !== "number" ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y)
    ) {
      return unsupported(layer, "SPLINE", "spline-malformed")
    }
    controlPoints.push({ x: p.x, y: p.y })
  }
  const knots = entity.knotValues ?? []
  const degree = entity.degreeOfSplineCurve ?? 3
  if (!Number.isInteger(degree) || degree < 1) {
    return unsupported(layer, "SPLINE", "spline-malformed")
  }
  if (!knots.every((k) => typeof k === "number" && Number.isFinite(k))) {
    return unsupported(layer, "SPLINE", "spline-malformed")
  }
  if (controlPoints.length < degree + 1) {
    return unsupported(layer, "SPLINE", "spline-malformed")
  }
  // Strict equality (not >=): an overlong knot vector lets deBoor's span
  // search advance past the last control point, causing undefined access
  // in the de Boor initialization. Codex review (PR #280) flagged this —
  // the third-voice audit missed by verify-math/verify-algo. Clamped
  // B-spline contract: knots.length === controlPoints.length + degree + 1.
  if (knots.length !== controlPoints.length + degree + 1) {
    return unsupported(layer, "SPLINE", "spline-malformed")
  }
  // dxf-parser's `rational` boolean comes from group-70 bit 4. If it's
  // set, the file declared rational weights — but the parser doesn't
  // expose per-control-point weights, so we can't honour them safely
  // and reject the entity rather than silently treat it as polynomial.
  if (entity.rational === true) {
    return unsupported(layer, "SPLINE", "spline-rational-not-supported")
  }
  return {
    kind: "spline",
    layer,
    controlPoints,
    knots,
    degree,
    closed: entity.closed === true,
  }
}

function unsupported(
  layer: string,
  originalType: string,
  reason: UnsupportedReason
): UnsupportedEntity {
  return { kind: "unsupported", layer, originalType, reason }
}
