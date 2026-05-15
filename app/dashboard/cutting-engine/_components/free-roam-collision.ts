import { Polygon, Vector, testPolygonPolygon } from "sat"
import type { PartTemplate } from "./PresetDimensionSelector"
import type { Point2D } from "@/nesting/types"

/** Single placement on the Free-roam canvas. Position is in sheet inches. */
export interface ManualPlacement {
  /** Unique instance id. */
  id: string
  /** References a `PartTemplate.id` in the parts queue. */
  templateId: string
  x: number
  y: number
  rotationRad: number
}

/**
 * SAT polygon for a placement at its current position + rotation, in
 * SHEET INCH coordinates. Rectangles expand to 4 rotated corners,
 * discs to a 20-vertex approximation. Consumers call
 * `testPolygonPolygon(a, b)` from `sat` to test for overlap.
 */
export function buildPlacementPolygon(placement: ManualPlacement, template: PartTemplate): Polygon {
  const width = template.width ?? template.diameter ?? 12
  const height = template.length ?? template.height ?? template.diameter ?? 12
  const cx = placement.x + width / 2
  const cy = placement.y + height / 2
  const cos = Math.cos(placement.rotationRad)
  const sin = Math.sin(placement.rotationRad)

  const rot = (dx: number, dy: number): Vector =>
    new Vector(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos)

  // Shape-registry templates carry a local-coords polygon. Translate
  // + rotate each vertex into sheet space. This path covers triangles,
  // stars, n-gons, ellipses, rings, and any custom shape.
  if (template.polygon && template.polygon.length >= 3) {
    const pts = template.polygon.map((p) => rot(p.x - width / 2, p.y - height / 2))
    return new Polygon(new Vector(0, 0), pts)
  }

  if (template.partType === "cylinder" && template.diameter) {
    // 20-gon disc approximation — SAT handles circles natively but
    // keeping the dispatch polygon-only keeps the hot path uniform.
    const r = template.diameter / 2
    const pts: Vector[] = []
    const N = 20
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      pts.push(new Vector(cx + r * Math.cos(a), cy + r * Math.sin(a)))
    }
    return new Polygon(new Vector(0, 0), pts)
  }

  return new Polygon(new Vector(0, 0), [
    rot(-width / 2, -height / 2),
    rot(width / 2, -height / 2),
    rot(width / 2, height / 2),
    rot(-width / 2, height / 2),
  ])
}

/**
 * Rotated-AABB bounds for a placement. Takes the placement's local
 * bbox (half-width, half-height) and expands it to the world-axis
 * bounding box that covers the rotated rectangle.
 *
 * For a rectangle rotated by θ, the AABB half-extents are
 *   (|cos θ|·w/2 + |sin θ|·h/2, |sin θ|·w/2 + |cos θ|·h/2).
 *
 * Discs are rotation-invariant (r on both axes).
 *
 * NOTE: the pre-C13b version used the un-rotated template bbox which
 * under-estimated coverage for 45°-rotated parts — the broad-phase
 * could skip an actual collision when AABBs nominally didn't overlap
 * but rotated corners poked into a neighbour. This fix keeps the
 * broad-phase conservative (never reject a real collision).
 */
function rotatedAabb(
  placement: ManualPlacement,
  template: PartTemplate
): { minX: number; minY: number; maxX: number; maxY: number } {
  const width = template.width ?? template.diameter ?? 12
  const height = template.length ?? template.height ?? template.diameter ?? 12
  const cx = placement.x + width / 2
  const cy = placement.y + height / 2
  if (template.partType === "cylinder" && template.diameter) {
    const r = template.diameter / 2
    return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r }
  }
  const cos = Math.abs(Math.cos(placement.rotationRad))
  const sin = Math.abs(Math.sin(placement.rotationRad))
  const halfW = (cos * width + sin * height) / 2
  const halfH = (sin * width + cos * height) / 2
  return { minX: cx - halfW, minY: cy - halfH, maxX: cx + halfW, maxY: cy + halfH }
}

/**
 * Transform a template-local hole loop into sheet space at the
 * placement's position + rotation. Mirrors the math in
 * `buildPlacementPolygon` so a hole loop renders, collides, and is
 * tested-against from the same coordinate frame.
 */
function holeToSheet(
  hole: ReadonlyArray<Point2D>,
  placement: ManualPlacement,
  template: PartTemplate
): Point2D[] {
  const width = template.width ?? template.diameter ?? 12
  const height = template.length ?? template.height ?? template.diameter ?? 12
  const cx = placement.x + width / 2
  const cy = placement.y + height / 2
  const cos = Math.cos(placement.rotationRad)
  const sin = Math.sin(placement.rotationRad)
  return hole.map((p) => {
    const dx = p.x - width / 2
    const dy = p.y - height / 2
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  })
}

/**
 * Even-odd ray-casting point-in-polygon test. Polygon vertices are
 * the closed loop's vertices in any winding; we don't care about
 * orientation here — only whether the point lies strictly inside.
 *
 * Strict-inside (excludes the boundary) keeps shared vertices between
 * a candidate and a hole boundary from counting as "inside the hole."
 * For the use-case (drag-place a small part into a gasket hole), the
 * operator is dropping the part well inside the void; the boundary
 * case is the un-interesting edge.
 */
function isPointInPolygon(point: Point2D, polygon: ReadonlyArray<Point2D>): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const intersect =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Strict (open) segment-segment intersection: true iff the two
 * segments cross at an interior point. Endpoints touching are NOT a
 * crossing — a candidate vertex landing exactly on a hole boundary
 * is the boundary case the strict point-in-polygon test above already
 * excludes.
 *
 * Standard cross-product orientation test (CLRS 33.1) with parallel
 * segments treated as non-crossing (they may overlap geometrically
 * but for "fully inside" they share the boundary, not cross it).
 */
function segmentsCross(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): boolean {
  const d1 = direction(p3, p4, p1)
  const d2 = direction(p3, p4, p2)
  const d3 = direction(p1, p2, p3)
  const d4 = direction(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function direction(a: Point2D, b: Point2D, c: Point2D): number {
  return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y)
}

/**
 * True iff every vertex of `inner` lies strictly inside `hole` AND no
 * edge of `inner` crosses any edge of `hole`. This is the strict
 * "fully contained" predicate the gasket-hole exception requires.
 *
 * Vertex-in-polygon alone would false-pass on concave holes: a U-shaped
 * hole whose vertices all sit inside the bbox could still have inner
 * edges that cross the U's arms. Edge-intersection rules that out
 * (Codex v2 sign-off: "I'd add edge-boundary intersection now, not
 * vertex-only").
 *
 * Inner is expected to be the SAT-collision polygon already in sheet
 * coords; hole is a sheet-space loop produced by `holeToSheet`.
 */
function isInnerFullyInsideHole(
  inner: ReadonlyArray<Point2D>,
  hole: ReadonlyArray<Point2D>
): boolean {
  if (inner.length < 3 || hole.length < 3) return false
  for (const v of inner) {
    if (!isPointInPolygon(v, hole)) return false
  }
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i]
    const b = inner[(i + 1) % inner.length]
    for (let j = 0; j < hole.length; j++) {
      const c = hole[j]
      const d = hole[(j + 1) % hole.length]
      if (segmentsCross(a, b, c, d)) return false
    }
  }
  return true
}

/**
 * Convert SAT's internal `Vector[]` polygon vertices into plain
 * `Point2D[]` so the geometry helpers above (point-in-polygon,
 * segment cross) don't need a SAT dependency. SAT polygons are built
 * with pos=(0, 0) and absolute world coords, so this is just a
 * structural copy.
 */
function satPolyToPoints(p: Polygon): Point2D[] {
  return p.points.map((v) => ({ x: v.x, y: v.y }))
}

/**
 * True iff `innerPoly` is fully contained in ANY of the host
 * template's holes (transformed into sheet space at the host
 * placement). Generic over the host's hole topology — works for
 * ring gaskets (one disc hole), full-face gaskets (bore + N bolt
 * holes), and arbitrary CAD-imported multi-loop shapes.
 *
 * Holes are voids per the jagua-rs convention — a placement fully
 * inside any host hole is permitted. Replaces the ring-specific
 * `isFullyInsideRingHole` from before PR 0b.
 *
 * Returns false for templates with no `holes` so the caller can
 * short-circuit cheaply.
 */
function isFullyInsideAnyHole(
  innerPoly: Polygon,
  hostPlacement: ManualPlacement,
  hostTemplate: PartTemplate
): boolean {
  if (!hostTemplate.holes || hostTemplate.holes.length === 0) return false
  const innerPoints = satPolyToPoints(innerPoly)
  for (const hole of hostTemplate.holes) {
    if (hole.length < 3) continue
    const sheetHole = holeToSheet(hole, hostPlacement, hostTemplate)
    if (isInnerFullyInsideHole(innerPoints, sheetHole)) return true
  }
  return false
}

/**
 * Check whether moving `candidate` to `(proposedX, proposedY)` would
 * overlap any OTHER placement. Returns true on collision so the caller
 * can reject the move. Rotated-AABB broad-phase first (conservative —
 * never skips a real hit), SAT narrow-phase second.
 *
 * Hole exception: if SAT reports overlap with another placement but
 * the candidate fits entirely inside one of the OTHER placement's
 * holes (or vice versa, when the candidate IS the hole-bearing part),
 * we treat it as non-collision — the candidate sits in the void, not
 * on the part's body.
 */
export function wouldCollide(
  candidate: ManualPlacement,
  proposedX: number,
  proposedY: number,
  others: ManualPlacement[],
  parts: PartTemplate[]
): boolean {
  const byId = new Map(parts.map((p) => [p.id, p]))
  const candidateTemplate = byId.get(candidate.templateId)
  if (!candidateTemplate) return false

  const proposed: ManualPlacement = { ...candidate, x: proposedX, y: proposedY }
  const proposedPoly = buildPlacementPolygon(proposed, candidateTemplate)
  const a = rotatedAabb(proposed, candidateTemplate)

  for (const other of others) {
    if (other.id === candidate.id) continue
    const otherTemplate = byId.get(other.templateId)
    if (!otherTemplate) continue

    const b = rotatedAabb(other, otherTemplate)
    if (a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY) continue

    const otherPoly = buildPlacementPolygon(other, otherTemplate)
    if (!testPolygonPolygon(proposedPoly, otherPoly)) continue

    // SAT overlap detected. Allow it when one part fits inside the
    // other's hole (works in either direction — symmetric per
    // Codex v2 sign-off).
    if (isFullyInsideAnyHole(proposedPoly, other, otherTemplate)) continue
    if (isFullyInsideAnyHole(otherPoly, proposed, candidateTemplate)) continue
    return true
  }
  return false
}
