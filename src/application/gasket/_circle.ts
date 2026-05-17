import type { Point2D } from "@/src/application/packing/types"

export const DEFAULT_CHORD_DEVIATION_IN = 0.005

export type Winding = "ccw" | "cw"

/**
 * Pick a vertex count `n` such that the sagitta of each chord is
 * bounded by `chordDeviationIn`. Exact formula:
 *
 *   sagitta = r(1 − cos(θ/2)) where θ = 2π/n
 *   → solve for n:  n = π / acos(1 − sag/r)
 *
 * Bumped to at least 16 verts so small gaskets still render smoothly.
 * Forced even so the cap's centerline vertex lands at exact (±r, 0) /
 * (0, ±r) — same reasoning as obround's `capVertexCount` and
 * downstream consumers that key bbox math off the rendered polygon.
 */
function chooseCircleVertexCount(radiusIn: number, chordDeviationIn: number): number {
  const minVertices = 16
  // Clamp the acos argument so chordDeviation > radius (a degenerate
  // case for sub-chord-deviation gaskets — minVertices wins below).
  const arg = Math.max(-1, Math.min(1, 1 - chordDeviationIn / radiusIn))
  const exact = arg >= 1 ? minVertices : Math.ceil(Math.PI / Math.acos(arg))
  const raw = Math.max(minVertices, exact)
  return raw % 2 === 0 ? raw : raw + 1
}

/**
 * Tessellate a circle centered at (cx, cy) with the requested winding.
 * Math-coords (Y-up): "ccw" walks CCW (positive signed area) for outer
 * rings; "cw" walks CW (negative signed area) for hole rings — matches
 * the orientation contract enforced by `sanitize-polygon-with-holes.ts`
 * and the jagua-rs adapter.
 */
export function tessellateCircleAt(
  cx: number,
  cy: number,
  radiusIn: number,
  chordDeviationIn: number,
  winding: Winding
): Point2D[] {
  const n = chooseCircleVertexCount(radiusIn, chordDeviationIn)
  const pts: Point2D[] = []
  const sign = winding === "ccw" ? 1 : -1
  for (let i = 0; i < n; i++) {
    const a = sign * (i / n) * 2 * Math.PI
    pts.push({ x: cx + radiusIn * Math.cos(a), y: cy + radiusIn * Math.sin(a) })
  }
  return pts
}
