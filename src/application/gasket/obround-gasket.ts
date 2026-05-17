import type { Point2D, PolygonWithHoles } from "@/src/application/packing/types"

import { DEFAULT_CHORD_DEVIATION_IN } from "./_circle"

export interface ObroundGasketSpec {
  /** Overall length (long axis), inches. Must be >= width. */
  length: number
  /** Overall width (short axis = cap diameter), inches. */
  width: number
  /** Chord deviation, inches; default 0.005″. */
  chordDeviation?: number
}

export function buildObroundGasket(spec: ObroundGasketSpec): PolygonWithHoles {
  const { length, width, chordDeviation = DEFAULT_CHORD_DEVIATION_IN } = spec
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error(`buildObroundGasket: length must be positive (got ${length})`)
  }
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`buildObroundGasket: width must be positive (got ${width})`)
  }
  if (width > length) {
    throw new Error(
      `buildObroundGasket: width (${width}) must be <= length (${length}) — obround caps need this`
    )
  }

  // Degenerate case (width === length): straightHalf === 0, both caps
  // sit on the same center — the polygon is a circle expressed as two
  // back-to-back semicircles. Bbox stays correct because capVertexCount
  // forces even count so the centerline vertex (±r, 0) is hit exactly.
  const r = width / 2
  const straightHalf = length / 2 - r
  const capVertices = capVertexCount(r, chordDeviation)
  const outer: Point2D[] = []

  // CCW winding (outer rings convention — see sanitize-polygon-with-holes
  // and the orientation contract).
  // Right semicircle sweeps a = −π/2 → +π/2 (CCW), centered at
  // (+straightHalf, 0).
  for (let i = 0; i <= capVertices; i++) {
    const a = -Math.PI / 2 + (i / capVertices) * Math.PI
    outer.push({ x: straightHalf + r * Math.cos(a), y: r * Math.sin(a) })
  }
  // Left semicircle sweeps a = +π/2 → +3π/2 (CCW), centered at
  // (−straightHalf, 0). Skip i=0 and i=capVertices to avoid duplicating
  // the join points the right cap already emitted.
  for (let i = 1; i < capVertices; i++) {
    const a = Math.PI / 2 + (i / capVertices) * Math.PI
    outer.push({ x: -straightHalf + r * Math.cos(a), y: r * Math.sin(a) })
  }

  return { outer, holes: [] }
}

function capVertexCount(radiusIn: number, chordDeviationIn: number): number {
  // Each cap is a semicircle covering π rad. The exact sagitta-bounded
  // step count for a full circle (2π) is `π / acos(1 − sag/r)`; the
  // semicircle uses the same per-chord step, so we halve. Forced even
  // so the centerline vertex (a=0 on right, a=π on left) lands at
  // integer `i = capVertices / 2`, giving exact bbox extremes.
  const minPerCap = 10
  const arg = Math.max(-1, Math.min(1, 1 - chordDeviationIn / radiusIn))
  const nFull = arg >= 1 ? minPerCap * 2 : Math.ceil(Math.PI / Math.acos(arg))
  const raw = Math.max(minPerCap, Math.ceil(nFull / 2))
  return raw % 2 === 0 ? raw : raw + 1
}
