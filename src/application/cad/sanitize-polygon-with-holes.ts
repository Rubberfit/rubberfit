// Polygon-with-holes sanitization for incoming CAD geometry.
//
// CAD-imported polygons (DXF curves, SVG paths) routinely arrive with
// the rough edges that production cutters can't survive:
//   - Near-duplicate consecutive vertices (chord-tessellation
//     artifacts, double-bezier endpoints).
//   - Self-intersections from path encoding tricks (figure-eights,
//     overlapping subpaths, kerf bevels drawn the long way around).
//   - Mixed winding (outer + holes shipped in the same orientation).
//
// jagua-rs only accepts polygons with the canonical winding contract
// PR 0a stamped into the wire (`PolygonWithHoles`): outer ring with
// one orientation, every hole the opposite. Passing un-sanitized CAD
// geometry through the wire produces solver errors, packing artifacts,
// or — worst case — silently-wrong cuts.
//
// This helper is the single ingress sanitiser for PR A (DXF curves),
// PR B (SVG), and PR C (gasket primitives). It runs Clipper's
// `SimplifyPolygons` with the even-odd fill rule, which both repairs
// self-intersections AND flattens the result into a hole-aware
// `PolyTree` from which outer / hole assignment falls out for free.
// Output orientation is enforced explicitly so the rest of the
// pipeline gets a known shape regardless of Clipper's internal
// convention.

import ClipperLib from "clipper-lib"

import type { PolygonWithHoles, Point2D } from "../packing/types"

/**
 * Fixed-point scale factor. Clipper operates on 64-bit integers; we
 * scale floats by 1e7 to preserve ~7 decimal places of precision —
 * comfortably above the 4dp `DECIMAL(10,4)` convention the rest of
 * the app uses for length / width / thickness / kerf.
 */
const CLIPPER_SCALE = 1e7

/**
 * Tolerance for `CleanPolygon`'s collinear / near-duplicate vertex
 * collapse. 1e-4 inches (~0.0025 mm) — below operator-perceptible
 * geometry and below any sane cutter's positioning resolution.
 */
const CLEAN_VERTEX_TOLERANCE = 1e-4 * CLIPPER_SCALE

type ClipperPoint = { X: number; Y: number }
type ClipperPath = ClipperPoint[]

/**
 * Sanitize a `PolygonWithHoles` for downstream consumers (jagua-rs
 * via the wire contract, Konva renderer, PDF emitter). Returns null
 * when the input is unrepairable — caller should surface an operator
 * toast rather than silently emit broken geometry.
 *
 * Repairs:
 *   1. Self-intersections in any ring → Clipper SimplifyPolygons
 *      with the even-odd fill rule splits self-crossing rings into
 *      well-formed non-self-intersecting loops.
 *   2. Near-duplicate vertices → Clipper CleanPolygon collapses
 *      vertices within `CLEAN_VERTEX_TOLERANCE` of each other.
 *   3. Mixed / wrong winding → outer ring forced to CCW (math
 *      coords; positive signed area); each hole forced to CW
 *      (opposite of outer). This matches jagua-rs's expectation —
 *      jagua_adapter.rs branches on hole presence and expects
 *      caller-side orientation to be consistent.
 *
 * Rejection cases (returns null):
 *   - Outer ring is missing or degenerates to < 3 vertices after
 *     cleaning.
 *   - Clipper's union of (outer ∪ holes) produces zero outer rings
 *     (entire shape collapses).
 *   - Clipper produces multiple outer rings (the input outer was
 *     self-intersecting in a way that split it into disjoint
 *     pieces). The caller — typically a CAD import path — should
 *     ask the operator to split the part themselves.
 */
export function sanitizePolygonWithHoles(input: PolygonWithHoles): PolygonWithHoles | null {
  if (!input.outer || input.outer.length < 3) return null

  // Step 1 — to fixed-point + per-ring near-duplicate vertex collapse.
  const outerPath = ClipperLib.Clipper.CleanPolygon(
    toClipperPath(input.outer),
    CLEAN_VERTEX_TOLERANCE
  )
  if (outerPath.length < 3) return null

  const holePaths: ClipperPath[] = []
  for (const hole of input.holes ?? []) {
    if (hole.length < 3) continue
    const cleaned = ClipperLib.Clipper.CleanPolygon(toClipperPath(hole), CLEAN_VERTEX_TOLERANCE)
    if (cleaned.length >= 3) holePaths.push(cleaned)
  }

  // Step 2 — repair self-intersections + hole topology in one pass.
  // SimplifyPolygons with even-odd fill takes (outer, holes...) as a
  // single subject set and re-emits a `PolyTree`-equivalent flat list
  // of non-self-intersecting paths whose orientation distinguishes
  // outer (CCW per Clipper's screen-space convention) from hole (CW).
  //
  // Using SimplifyPolygons rather than Execute(Union, ...) here
  // because Simplify handles a single subject set; Union expects
  // subject vs clip and doesn't apply the even-odd self-repair the
  // same way for a polygon-with-holes input.
  const subject: ClipperLib.Paths = [outerPath, ...holePaths]
  const repaired: ClipperLib.Paths = ClipperLib.Clipper.SimplifyPolygons(
    subject,
    ClipperLib.PolyFillType.pftEvenOdd
  )

  if (repaired.length === 0) return null

  // Step 3 — partition by signed area. Positive area in screen-space
  // Clipper coords is CCW (= "outer" in even-odd interpretation);
  // negative is CW (= "hole"). Computed via Clipper's own Area which
  // uses the same sign convention as Orientation. We compute it in
  // the integer space so floating-point doesn't tip near-zero areas
  // across the sign boundary.
  const outers: ClipperPath[] = []
  const holes: ClipperPath[] = []
  for (const path of repaired) {
    if (path.length < 3) continue
    const area = ClipperLib.Clipper.Area(path)
    if (area > 0) outers.push(path)
    else if (area < 0) holes.push(path)
    // area === 0 → degenerate, drop
  }

  if (outers.length === 0) return null
  if (outers.length > 1) {
    // Disjoint outers: the original "outer" was self-intersecting
    // into separate pieces, or holes were oriented as outers.
    // Caller surfaces a toast — we don't pick "the largest" because
    // the geometry intent is ambiguous.
    return null
  }

  // Step 4 — to float coords + enforce orientation contract.
  //
  // The wire contract jagua-rs sits behind expects opposite winding
  // for outer vs. holes. Clipper's even-odd output already produces
  // opposite winding (outer one way, holes the other), but the
  // direction in math coords depends on whether the input was in
  // screen-space (Y-down) or math-space (Y-up). We force the canonical
  // form here:
  //   outer  → CCW in math coords (positive signed area in Y-up math)
  //   holes  → CW in math coords (negative signed area in Y-up math)
  // matching what `buildPart`'s `normalizePolygon` already produces
  // for the single-loop legacy path.
  const outerRing = enforceMathCcw(fromClipperPath(outers[0]))
  const holeRings = holes.map((h) => enforceMathCw(fromClipperPath(h)))

  return { outer: outerRing, holes: holeRings }
}

function toClipperPath(points: ReadonlyArray<Point2D>): ClipperPath {
  return points.map((p) => ({
    X: Math.round(p.x * CLIPPER_SCALE),
    Y: Math.round(p.y * CLIPPER_SCALE),
  }))
}

function fromClipperPath(path: ReadonlyArray<ClipperPoint>): Point2D[] {
  return path.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }))
}

/**
 * Signed polygon area, math convention: positive = CCW with Y up.
 * Operates on float coords so we can reuse the result for orientation
 * decisions without re-quantizing back to Clipper integers.
 */
function signedArea(points: ReadonlyArray<Point2D>): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

function enforceMathCcw(points: Point2D[]): Point2D[] {
  return signedArea(points) < 0 ? points.slice().reverse() : points
}

function enforceMathCw(points: Point2D[]): Point2D[] {
  return signedArea(points) > 0 ? points.slice().reverse() : points
}
