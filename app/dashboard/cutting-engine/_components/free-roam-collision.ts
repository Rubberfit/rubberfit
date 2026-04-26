import { Polygon, Vector, testPolygonPolygon } from "sat"
import type { PartTemplate } from "./PresetDimensionSelector"

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
 * True when every vertex of `innerPoly` lies inside the inner-hole disc
 * of a ring placement (radius `ringTemplate.innerRadius` centered on
 * the ring's bbox center). Used to exempt parts that fit entirely inside
 * a ring's hole from the standard collision rejection — the SAT polygon
 * for a ring traces the outer boundary only (registry comment in
 * `shape-registry.ts`), so a small disc dropped in the middle would
 * otherwise read as overlapping the ring's body.
 *
 * Returns false for non-ring templates (no `innerRadius`) so the caller
 * can short-circuit cheaply.
 */
function isFullyInsideRingHole(
  innerPoly: Polygon,
  ringPlacement: ManualPlacement,
  ringTemplate: PartTemplate
): boolean {
  const innerR = ringTemplate.innerRadius
  if (innerR == null || innerR <= 0) return false
  const ringW = ringTemplate.width ?? ringTemplate.diameter ?? 12
  const ringH = ringTemplate.length ?? ringTemplate.height ?? ringTemplate.diameter ?? 12
  const cx = ringPlacement.x + ringW / 2
  const cy = ringPlacement.y + ringH / 2
  const r2 = innerR * innerR
  // `buildPlacementPolygon` constructs Polygons with pos=(0,0) and
  // points already in sheet space, so we can read coords directly.
  for (const v of innerPoly.points) {
    const dx = v.x - cx
    const dy = v.y - cy
    if (dx * dx + dy * dy > r2) return false
  }
  return true
}

/**
 * Check whether moving `candidate` to `(proposedX, proposedY)` would
 * overlap any OTHER placement. Returns true on collision so the caller
 * can reject the move. Rotated-AABB broad-phase first (conservative —
 * never skips a real hit), SAT narrow-phase second.
 *
 * Ring exception: if SAT reports overlap with a ring placement but the
 * candidate fits entirely inside the ring's hole (or vice versa), we
 * treat it as non-collision — the candidate is in the hole, not the
 * ring's body.
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
    // other's ring hole (works in either direction).
    if (isFullyInsideRingHole(proposedPoly, other, otherTemplate)) continue
    if (isFullyInsideRingHole(otherPoly, proposed, candidateTemplate)) continue
    return true
  }
  return false
}
