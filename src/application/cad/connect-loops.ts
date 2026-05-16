// Walk the narrowed DXF entities on the chosen layer and assemble closed
// loops. Task 5 (PR A) rebuilds this for curve-aware tessellation:
//
//   * CIRCLE                         → standalone tessellated loop
//   * ELLIPSE full sweep             → standalone tessellated loop
//   * SPLINE closed                  → standalone tessellated loop
//   * LWPOLYLINE/POLYLINE closed     → tessellated loop (bulge-aware)
//   * LINE + ARC chains              → assembled via endpoint-snap
//
// Open SPLINE / partial ELLIPSE participation in chain assembly is
// deferred to v1.1 — those are rare in DXF practice and adding them
// here would require parametric-start/end extraction we don't yet
// expose. They'll fall through silently and the operator sees the
// chain that they CAN form via LINE + ARC.
//
// Grouping the resulting `Point2D[][]` into outer + holes is Task 6's
// job (`group-parts.ts` — containment-graph hole assignment). This
// file emits an unstructured flat list of loops.

import type {
  ArcEntity,
  CircleEntity,
  DxfDocument,
  DxfEntity,
  EllipseEntity,
  LineEntity,
  LwPolylineEntity,
  Point2D,
  PolylineEntity,
  RejectedEntity,
  SplineEntity,
  UnsupportedReason,
} from "./dxf-types"
import {
  type TessellationOptions,
  tessellateArc,
  tessellateBulge,
  tessellateCircle,
  tessellateEllipse,
  tessellateSpline,
} from "./tessellate-curves"

/** Endpoint-snap tolerance in document units. CAD endpoints rarely match
 *  to f64 precision after rotation/scale operations. */
export const ENDPOINT_TOLERANCE = 1e-4

const DEG_TO_RAD = Math.PI / 180
const FULL_SWEEP_EPSILON = 1e-9

export interface ConnectLoopsResult {
  loops: Point2D[][]
  rejected: RejectedEntity[]
}

/**
 * Pick the layer to operate on by default: the one with the most
 * closed-loop candidates. Falls back to "0" when nothing closed-loop-y
 * exists. Operator override is PR2; for PR1 this is a heuristic that
 * keeps single-layer modal-sheet exports flowing through without a
 * picker.
 */
export function pickDefaultLayer(doc: DxfDocument): string {
  const loopCounts = new Map<string, number>()
  const lineCounts = new Map<string, number>()
  for (const entity of doc.entities) {
    const isClosedCandidate =
      entity.kind === "circle" ||
      entity.kind === "ellipse" ||
      entity.kind === "spline" ||
      ((entity.kind === "lwpolyline" || entity.kind === "polyline") && entity.closed)
    if (isClosedCandidate) {
      loopCounts.set(entity.layer, (loopCounts.get(entity.layer) ?? 0) + 1)
    } else if (entity.kind === "line" || entity.kind === "arc") {
      lineCounts.set(entity.layer, (lineCounts.get(entity.layer) ?? 0) + 1)
    }
  }
  if (loopCounts.size > 0) {
    return [...loopCounts].sort((a, b) => b[1] - a[1])[0][0]
  }
  if (lineCounts.size > 0) {
    return [...lineCounts].sort((a, b) => b[1] - a[1])[0][0]
  }
  return "0"
}

export function connectLoops(doc: DxfDocument, layerName: string): ConnectLoopsResult {
  const loops: Point2D[][] = []
  const rejected: RejectedEntity[] = []
  const layerEntities = doc.entities.filter((e) => e.layer === layerName)
  const options: TessellationOptions = {}

  for (const entity of layerEntities) {
    if (entity.kind === "unsupported") {
      rejected.push({
        layer: entity.layer,
        originalType: entity.originalType,
        reason: entity.reason,
      })
    }
  }

  const chainables: DxfEntity[] = []
  for (const entity of layerEntities) {
    const standalone = tryStandaloneLoop(entity, options)
    if (standalone === "chain") {
      chainables.push(entity)
      continue
    }
    if (standalone.loop) {
      loops.push(standalone.loop)
    } else if (standalone.reason) {
      rejected.push({
        layer: entity.layer,
        originalType: standalone.originalType,
        reason: standalone.reason,
      })
    }
  }

  loops.push(...buildLoopsFromSegments(collectChainableSegments(chainables, options)))

  return { loops, rejected }
}

interface StandaloneResult {
  loop?: Point2D[]
  originalType: string
  reason?: UnsupportedReason
}

/**
 * Try to convert an entity to a standalone closed loop. Returns "chain"
 * when the entity should instead be fed to the segment-chain assembler.
 * Returns a `StandaloneResult` (with optional `loop` or `reason`) when
 * the entity is a self-contained closed shape (or a recognised failure
 * to convert one).
 */
function tryStandaloneLoop(
  entity: DxfEntity,
  options: TessellationOptions
): StandaloneResult | "chain" {
  switch (entity.kind) {
    case "line":
    case "arc":
      return "chain"
    case "circle":
      return circleToLoop(entity, options)
    case "ellipse":
      return ellipseToLoop(entity, options)
    case "spline":
      return splineToLoop(entity, options)
    case "lwpolyline":
    case "polyline":
      return polylineToLoop(entity, options)
    case "unsupported":
      // Already pushed into `rejected` upstream.
      return { originalType: entity.originalType }
  }
}

function circleToLoop(entity: CircleEntity, options: TessellationOptions): StandaloneResult {
  const verts = tessellateCircle(entity.center, entity.radius, options)
  if (verts.length < 3) return { originalType: "CIRCLE" }
  return { originalType: "CIRCLE", loop: verts }
}

function ellipseToLoop(entity: EllipseEntity, options: TessellationOptions): StandaloneResult {
  // ELLIPSE startParam/endParam are RADIANS along the parametric ellipse.
  // A partial sweep is rare in 2D mechanical DXF and chain-assembly with
  // open-ellipse endpoints is deferred to v1.1 — drop it silently here
  // so the rest of the file flows through.
  const sweep = entity.endParam - entity.startParam
  const isFull = Math.abs(Math.abs(sweep) - 2 * Math.PI) < FULL_SWEEP_EPSILON
  if (!isFull) return { originalType: "ELLIPSE" }
  const verts = tessellateEllipse(
    {
      center: entity.center,
      majorAxisEnd: entity.majorAxisEnd,
      axisRatio: entity.axisRatio,
      startParam: entity.startParam,
      endParam: entity.endParam,
    },
    options
  )
  if (verts.length < 3) return { originalType: "ELLIPSE" }
  return { originalType: "ELLIPSE", loop: verts }
}

function splineToLoop(entity: SplineEntity, options: TessellationOptions): StandaloneResult {
  if (!entity.closed) return { originalType: "SPLINE" }
  const verts = tessellateSpline(
    {
      controlPoints: entity.controlPoints,
      knots: entity.knots,
      degree: entity.degree,
      closed: entity.closed,
      weights: entity.weights,
    },
    options
  )
  if (verts.length < 3) return { originalType: "SPLINE" }
  return { originalType: "SPLINE", loop: verts }
}

function polylineToLoop(
  entity: LwPolylineEntity | PolylineEntity,
  options: TessellationOptions
): StandaloneResult {
  const originalType = entity.kind === "lwpolyline" ? "LWPOLYLINE" : "POLYLINE"
  if (!entity.closed) return { originalType }
  const loop = tessellateClosedPolyline(entity, options)
  if (!loop || loop.length < 3) return { originalType }
  return { originalType, loop }
}

function tessellateClosedPolyline(
  entity: LwPolylineEntity | PolylineEntity,
  options: TessellationOptions
): Point2D[] | null {
  if (!entity.closed) return null
  if (entity.vertices.length < 3) return null
  const out: Point2D[] = []
  for (let i = 0; i < entity.vertices.length; i++) {
    const cur = entity.vertices[i]
    const next = entity.vertices[(i + 1) % entity.vertices.length]
    if (cur.bulge !== 0) {
      out.push(
        ...tessellateBulge({ x: cur.x, y: cur.y }, { x: next.x, y: next.y }, cur.bulge, options)
      )
    } else {
      out.push({ x: cur.x, y: cur.y })
    }
  }
  return out
}

interface ChainSegment {
  start: Point2D
  end: Point2D
  /** Interior polyline points between `start` and `end`, exclusive of both. */
  midpoints: Point2D[]
}

function collectChainableSegments(
  entities: DxfEntity[],
  options: TessellationOptions
): ChainSegment[] {
  const segments: ChainSegment[] = []
  for (const entity of entities) {
    if (entity.kind === "line") {
      segments.push(lineToSegment(entity))
    } else if (entity.kind === "arc") {
      segments.push(arcToSegment(entity, options))
    }
    // Open splines / partial ellipses deferred to v1.1.
  }
  return segments
}

function lineToSegment(entity: LineEntity): ChainSegment {
  return { start: entity.start, end: entity.end, midpoints: [] }
}

function arcToSegment(entity: ArcEntity, options: TessellationOptions): ChainSegment {
  const startRad = entity.startAngleDeg * DEG_TO_RAD
  const endRad = entity.endAngleDeg * DEG_TO_RAD
  const tess = tessellateArc(entity.center, entity.radius, startRad, endRad, options)
  const start = tess[0]
  const end = tess[tess.length - 1]
  const midpoints = tess.slice(1, -1)
  return { start, end, midpoints }
}

function buildLoopsFromSegments(segments: ChainSegment[]): Point2D[][] {
  if (segments.length === 0) return []
  const used = new Array<boolean>(segments.length).fill(false)
  const loops: Point2D[][] = []

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue
    used[i] = true
    const seed = segments[i]
    const loop: Point2D[] = [seed.start, ...seed.midpoints, seed.end]
    let closed = false

    while (true) {
      const tail = loop[loop.length - 1]
      if (pointsClose(tail, loop[0])) {
        // Drop the duplicate closing vertex.
        loop.pop()
        closed = true
        break
      }
      const nextIdx = segments.findIndex(
        (s, idx) => !used[idx] && (pointsClose(s.start, tail) || pointsClose(s.end, tail))
      )
      if (nextIdx === -1) break
      used[nextIdx] = true
      const next = segments[nextIdx]
      if (pointsClose(next.start, tail)) {
        loop.push(...next.midpoints, next.end)
      } else {
        loop.push(...next.midpoints.slice().reverse(), next.start)
      }
    }

    if (closed && loop.length >= 3) {
      loops.push(loop)
    }
  }

  return loops
}

function pointsClose(a: Point2D, b: Point2D): boolean {
  return Math.abs(a.x - b.x) <= ENDPOINT_TOLERANCE && Math.abs(a.y - b.y) <= ENDPOINT_TOLERANCE
}
