// Walk the narrowed DXF entities on the chosen layer and assemble
// closed loops.
//
// PR1 only handles three sources:
//   * LWPOLYLINE with `closed === true` and zero bulges → single loop
//   * POLYLINE  with `closed === true` and zero bulges → single loop
//   * LINE chains whose endpoints meet within tolerance → single loop
//
// Anything bulged is rejected up front (an arc disguised as a chord
// would silently lie about the cut path). Splines / arcs / circles
// are already collapsed to `UnsupportedEntity` upstream and surface
// as `rejected` rows here for the dialog's warnings region.

import type {
  DxfDocument,
  LineEntity,
  LwPolylineEntity,
  Point2D,
  PolylineEntity,
  RejectedEntity,
  UnsupportedReason,
} from "./dxf-types"

/** Endpoint-snap tolerance in document units. CAD endpoints rarely match
 *  to f64 precision after rotation/scale operations. */
export const ENDPOINT_TOLERANCE = 1e-4

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
  const counts = new Map<string, number>()
  for (const entity of doc.entities) {
    if (entity.kind === "lwpolyline" || entity.kind === "polyline" || entity.kind === "line") {
      counts.set(entity.layer, (counts.get(entity.layer) ?? 0) + 1)
    }
  }
  if (counts.size === 0) return "0"
  let best: { layer: string; count: number } = { layer: "0", count: -1 }
  for (const [layer, count] of counts) {
    if (count > best.count) best = { layer, count }
  }
  return best.layer
}

export function connectLoops(doc: DxfDocument, layerName: string): ConnectLoopsResult {
  const loops: Point2D[][] = []
  const rejected: RejectedEntity[] = []

  for (const entity of doc.entities) {
    if (entity.kind === "unsupported") {
      rejected.push({
        layer: entity.layer,
        originalType: entity.originalType,
        reason: entity.reason,
      })
    }
  }

  const layerEntities = doc.entities.filter((e) => e.layer === layerName)

  for (const entity of layerEntities) {
    if (entity.kind === "lwpolyline") {
      const polyResult = closedPolyToLoop(entity, "LWPOLYLINE")
      if (polyResult.loop) {
        loops.push(polyResult.loop)
      } else if (polyResult.reason) {
        rejected.push({
          layer: entity.layer,
          originalType: "LWPOLYLINE",
          reason: polyResult.reason,
        })
      }
    } else if (entity.kind === "polyline") {
      const polyResult = closedPolyToLoop(entity, "POLYLINE")
      if (polyResult.loop) {
        loops.push(polyResult.loop)
      } else if (polyResult.reason) {
        rejected.push({ layer: entity.layer, originalType: "POLYLINE", reason: polyResult.reason })
      }
    }
  }

  const lines = layerEntities.filter((e): e is LineEntity => e.kind === "line")
  loops.push(...buildLoopsFromLines(lines))

  return { loops, rejected }
}

interface PolyResult {
  loop?: Point2D[]
  reason?: UnsupportedReason
}

function closedPolyToLoop(
  entity: LwPolylineEntity | PolylineEntity,
  _kind: "LWPOLYLINE" | "POLYLINE"
): PolyResult {
  if (!entity.closed) return {}
  const hasBulge = entity.vertices.some((v) => v.bulge !== 0)
  if (hasBulge) return { reason: "polyline-contains-bulge" }
  if (entity.vertices.length < 3) return {}
  return { loop: entity.vertices.map((v) => ({ x: v.x, y: v.y })) }
}

interface LineSegment {
  start: Point2D
  end: Point2D
}

function buildLoopsFromLines(lines: LineEntity[]): Point2D[][] {
  if (lines.length === 0) return []
  const segments: LineSegment[] = lines.map((l) => ({ start: l.start, end: l.end }))
  const used = new Array<boolean>(segments.length).fill(false)
  const loops: Point2D[][] = []

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue
    used[i] = true
    const loop: Point2D[] = [segments[i].start, segments[i].end]
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
        (seg, idx) => !used[idx] && (pointsClose(seg.start, tail) || pointsClose(seg.end, tail))
      )
      if (nextIdx === -1) break
      used[nextIdx] = true
      const next = segments[nextIdx]
      loop.push(pointsClose(next.start, tail) ? next.end : next.start)
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
