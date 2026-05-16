// Shared parametric-curve tessellation primitives.
//
// Every curve type DXF can throw at us (ARC, CIRCLE, ELLIPSE, SPLINE, polyline
// bulges) and every future SVG curve type (cubic/quadratic Beziers) shares a
// single shape: a parametric function P(t): [0,1] -> R^2. This module exposes
// one adaptive subdivision primitive (`adaptiveSubdivide`) plus a thin wrapper
// per curve kind.
//
// Adaptive subdivision algorithm: chord-deviation-bounded recursive split.
// Given P and a chord-deviation tolerance epsilon, split [a, b] at the midpoint
// until the perpendicular distance from P((a+b)/2) to the chord P(a)->P(b) is
// <= epsilon. Emit P(a) and recurse on the halves. The closing endpoint is
// emitted by the caller (or dropped — closed loops do not duplicate the seam).
//
// References:
//   - chord-deviation subdivision: makerjs.chain.toKeyPoints (MIT, internal)
//   - de Boor's algorithm: Piegl & Tiller, "The NURBS Book", section 3.2
//   - DXF bulge convention: Autodesk DXF reference + Lee Mac AutoLISP source
//
// This file is intentionally I/O-free and DXF-type-free aside from `Point2D`.
// It will be reused unchanged by the PR B SVG importer.

import type { Point2D } from "./dxf-types"

const DEFAULT_CHORD_DEVIATION = 0.005 // document units (inches or mm per $INSUNITS)
const MAX_RECURSION_DEPTH = 14 // 2^14 = 16384 vertices is far past any sensible curve

export interface TessellationOptions {
  /** Maximum perpendicular distance from the true curve to the chord, in document units. */
  chordDeviation?: number
}

type Parametric = (t: number) => Point2D

/**
 * Adaptive chord-deviation-bounded subdivision of a parametric curve over [t0, t1].
 *
 * Emits the leading chord endpoint P(t0) plus any midpoints needed to keep
 * the perpendicular chord deviation <= `chordDeviation`. Does NOT emit the
 * closing endpoint P(t1) — callers decide whether to append it (open curves
 * do; closed loops drop the duplicate).
 *
 * O(N) where N is the emitted vertex count.
 */
export function adaptiveSubdivide(
  curve: Parametric,
  t0: number,
  t1: number,
  chordDeviation: number,
  depth = 0
): Point2D[] {
  const p0 = curve(t0)
  if (depth >= MAX_RECURSION_DEPTH) return [p0]

  const p1 = curve(t1)
  const tm = (t0 + t1) / 2
  const pm = curve(tm)

  // Perpendicular distance from pm to the chord p0->p1.
  // |((pm - p0) x (p1 - p0))| / |p1 - p0|
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const chordLen = Math.hypot(dx, dy)
  const dist =
    chordLen < 1e-12
      ? Math.hypot(pm.x - p0.x, pm.y - p0.y) // degenerate chord — measure raw displacement
      : Math.abs((pm.x - p0.x) * dy - (pm.y - p0.y) * dx) / chordLen

  if (dist <= chordDeviation) {
    return [p0]
  }

  return [
    ...adaptiveSubdivide(curve, t0, tm, chordDeviation, depth + 1),
    ...adaptiveSubdivide(curve, tm, t1, chordDeviation, depth + 1),
  ]
}

/**
 * Closed circle as a CCW polygon. Returns N vertices (NO duplicate closing
 * vertex — closed loops drop the seam).
 */
export function tessellateCircle(
  center: Point2D,
  radius: number,
  options: TessellationOptions = {}
): Point2D[] {
  if (radius <= 0) return []
  const chordDeviation = options.chordDeviation ?? DEFAULT_CHORD_DEVIATION
  const curve: Parametric = (t) => ({
    x: center.x + radius * Math.cos(t * 2 * Math.PI),
    y: center.y + radius * Math.sin(t * 2 * Math.PI),
  })
  return adaptiveSubdivide(curve, 0, 1, chordDeviation)
}

/**
 * Arc from `startAngle` to `endAngle` (radians, CCW from +X). DXF stores
 * angles in degrees — the caller converts. Open polyline: emits the endpoint.
 */
export function tessellateArc(
  center: Point2D,
  radius: number,
  startAngle: number,
  endAngle: number,
  options: TessellationOptions = {}
): Point2D[] {
  if (radius <= 0) return []
  const chordDeviation = options.chordDeviation ?? DEFAULT_CHORD_DEVIATION
  // Normalize sweep CCW into (0, 2π].
  let sweep = endAngle - startAngle
  while (sweep <= 0) sweep += 2 * Math.PI
  const curve: Parametric = (t) => ({
    x: center.x + radius * Math.cos(startAngle + t * sweep),
    y: center.y + radius * Math.sin(startAngle + t * sweep),
  })
  const verts = adaptiveSubdivide(curve, 0, 1, chordDeviation)
  verts.push(curve(1)) // arcs are open — emit the endpoint
  return verts
}

export interface EllipseInput {
  center: Point2D
  /** Vector from `center` to the major-axis endpoint — defines length AND orientation. */
  majorAxisEnd: Point2D
  /** minor/major length ratio. */
  axisRatio: number
  /**
   * Parametric range. DXF ELLIPSE stores these in radians along the
   * parametric ellipse, NOT the geometric angle from center. Full ellipse
   * uses [0, 2π].
   */
  startParam: number
  endParam: number
}

/**
 * Ellipse — full or partial sweep. Full ellipses drop the seam; partial
 * sweeps emit the endpoint.
 */
export function tessellateEllipse(
  input: EllipseInput,
  options: TessellationOptions = {}
): Point2D[] {
  const { center, majorAxisEnd, axisRatio, startParam, endParam } = input
  const majorLen = Math.hypot(majorAxisEnd.x, majorAxisEnd.y)
  if (majorLen <= 0 || axisRatio <= 0) return []
  const minorLen = majorLen * axisRatio
  // Rotation of the major axis relative to +X.
  const theta = Math.atan2(majorAxisEnd.y, majorAxisEnd.x)
  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)
  const chordDeviation = options.chordDeviation ?? DEFAULT_CHORD_DEVIATION
  let sweep = endParam - startParam
  while (sweep <= 0) sweep += 2 * Math.PI
  const isClosed = Math.abs(sweep - 2 * Math.PI) < 1e-9

  const curve: Parametric = (t) => {
    const p = startParam + t * sweep
    const lx = majorLen * Math.cos(p)
    const ly = minorLen * Math.sin(p)
    return {
      x: center.x + lx * cosT - ly * sinT,
      y: center.y + lx * sinT + ly * cosT,
    }
  }
  const verts = adaptiveSubdivide(curve, 0, 1, chordDeviation)
  if (!isClosed) verts.push(curve(1))
  return verts
}

/**
 * Bulged polyline segment (DXF LWPOLYLINE / POLYLINE vertex-with-bulge).
 * Returns the arc tessellation from `a` toward `b` — exclusive of `b`. The
 * caller appends the next polyline vertex (which IS `b` for non-closing
 * segments, or the first vertex for the closing segment of a closed
 * polyline).
 *
 * DXF bulge convention (per Autodesk DXF reference + Lee Mac canonical
 * AutoLISP source):
 *   - bulge = tan(theta / 4), where theta is the signed included angle
 *   - positive bulge: arc bulges to the LEFT of A->B (i.e., the side reached
 *     by rotating A->B by +90 degrees in the XY plane)
 *   - negative bulge: arc bulges to the RIGHT of A->B
 *
 * Center calculation (verified by hand for the four-quadrant test set in
 * tessellate-curves.test.ts — bulge in {-1, -tan(pi/8), tan(pi/8), 1}):
 *   - The arc center lies on the perpendicular bisector of A->B.
 *   - Distance from chord midpoint to center = r * cos(|theta|/2):
 *       * |theta| < pi (short arc): cos > 0, center is OPPOSITE the bulge side.
 *       * |theta| > pi (reflex arc): cos < 0, center is on the SAME side as bulge.
 *   - For positive bulge (bulges left), center is on the RIGHT perpendicular.
 *   - For negative bulge (bulges right), center is on the LEFT perpendicular.
 *
 * Walk direction:
 *   - Positive bulge: walk CW around the computed center (decreasing angle
 *     from A to B).
 *   - Negative bulge: walk CCW around the computed center.
 *
 * Worked example (apex test): bulge = 1, A = (0,0), B = (1,0):
 *   theta = pi; r = 0.5; center = (0.5, 0); startAngle = pi, endAngle = 0.
 *   CW sweep = -pi. At t = 0.5, angle = pi/2 -> point = (0.5, 0.5). Apex UP.
 */
export function tessellateBulge(
  a: Point2D,
  b: Point2D,
  bulge: number,
  options: TessellationOptions = {}
): Point2D[] {
  if (bulge === 0) return [a]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const chordLen = Math.hypot(dx, dy)
  if (chordLen < 1e-12) return [a]

  const theta = 4 * Math.atan(bulge) // signed included angle
  const absTheta = Math.abs(theta)
  const radius = chordLen / (2 * Math.sin(absTheta / 2))

  // Unit chord direction.
  const uX = dx / chordLen
  const uY = dy / chordLen
  // Right-perpendicular of A->B (i.e., A->B rotated by -90 degrees).
  const rightX = uY
  const rightY = -uX

  // Center offset along the right perpendicular. Sign(bulge) picks the side.
  // Magnitude r * cos(|theta|/2) is signed: positive for short arc, negative
  // for reflex arc (which flips the center to the bulge side).
  const sign = bulge > 0 ? 1 : -1
  const centerDist = radius * Math.cos(absTheta / 2)
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const cx = midX + sign * centerDist * rightX
  const cy = midY + sign * centerDist * rightY

  const startAngle = Math.atan2(a.y - cy, a.x - cx)
  const endAngle = Math.atan2(b.y - cy, b.x - cx)

  // Sweep: positive bulge walks CW (negative sweep); negative bulge walks CCW.
  let sweep = endAngle - startAngle
  if (bulge > 0) {
    while (sweep >= 0) sweep -= 2 * Math.PI
  } else {
    while (sweep <= 0) sweep += 2 * Math.PI
  }

  const chordDeviation = options.chordDeviation ?? DEFAULT_CHORD_DEVIATION
  const curve: Parametric = (t) => ({
    x: cx + radius * Math.cos(startAngle + t * sweep),
    y: cy + radius * Math.sin(startAngle + t * sweep),
  })
  // Open segment — caller appends `b` (or the next polyline vertex).
  return adaptiveSubdivide(curve, 0, 1, chordDeviation)
}

export interface SplineInput {
  controlPoints: Point2D[]
  knots: number[]
  degree: number
  closed: boolean
  /** Optional weights for rational splines — we reject if any !== 1.0 (v1). */
  weights?: number[]
}

/**
 * NURBS spline via de Boor's algorithm on adaptive parameter sampling.
 *
 * Rational splines (weights !== 1) are rejected — they're rare in 2D
 * mechanical drawings and a future PR can add support if needed.
 *
 * Reference: Piegl & Tiller, "The NURBS Book", section 3.2.
 */
export function tessellateSpline(input: SplineInput, options: TessellationOptions = {}): Point2D[] {
  const { controlPoints, knots, degree, weights } = input
  if (controlPoints.length < degree + 1) return []
  if (weights && weights.some((w) => Math.abs(w - 1.0) > 1e-9)) {
    throw new Error("Rational splines (non-unit weights) not supported in v1")
  }
  // Parameter range = [knots[degree], knots[knots.length - degree - 1]].
  const tMin = knots[degree]
  const tMax = knots[knots.length - degree - 1]
  if (!(tMax > tMin)) return []
  const chordDeviation = options.chordDeviation ?? DEFAULT_CHORD_DEVIATION

  const curve: Parametric = (t) => deBoor(controlPoints, knots, degree, tMin + t * (tMax - tMin))

  const verts = adaptiveSubdivide(curve, 0, 1, chordDeviation)
  if (!input.closed) verts.push(curve(1))
  return verts
}

/**
 * de Boor's algorithm — evaluate a B-spline of given degree at parameter t.
 * O(degree^2) per evaluation. Piegl & Tiller, "The NURBS Book", section 3.2.
 *
 * Knot-span search: find the largest k such that knots[k] <= t. We clamp at
 * `knots.length - degree - 2` so t = tMax still resolves to a valid span
 * (the textbook off-by-one trap at the boundary).
 */
function deBoor(controls: Point2D[], knots: number[], degree: number, t: number): Point2D {
  // Find span k: knots[k] <= t < knots[k+1], clamped at the last valid span.
  const lastSpan = knots.length - degree - 2
  let k = degree
  while (k < lastSpan && t >= knots[k + 1]) k++

  // Initialize d[j] = controls[k - degree + j] for j in 0..degree.
  const d: Point2D[] = []
  for (let j = 0; j <= degree; j++) {
    const cp = controls[k - degree + j]
    d.push({ x: cp.x, y: cp.y })
  }
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = k - degree + j
      const denom = knots[i + degree - r + 1] - knots[i]
      const alpha = denom === 0 ? 0 : (t - knots[i]) / denom
      d[j] = {
        x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
        y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
      }
    }
  }
  return d[degree]
}
