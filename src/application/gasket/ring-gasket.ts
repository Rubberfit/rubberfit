import type { PolygonWithHoles } from "@/src/application/packing/types"

import { DEFAULT_CHORD_DEVIATION_IN, tessellateCircleAt } from "./_circle"

export interface RingGasketSpec {
  /** Outer diameter, inches. */
  outerDiameter: number
  /** Inner diameter, inches (must be strictly less than outerDiameter). */
  innerDiameter: number
  /**
   * Chord deviation (max sagitta) in inches for circle tessellation.
   * Default 0.005″ ≈ 32–64 vertices per circle at typical gasket sizes
   * (spec §5.1 / §10 risks row 3 — keeps jagua-rs pack time bounded).
   */
  chordDeviation?: number
}

export function buildRingGasket(spec: RingGasketSpec): PolygonWithHoles {
  const { outerDiameter, innerDiameter, chordDeviation = DEFAULT_CHORD_DEVIATION_IN } = spec
  if (!Number.isFinite(outerDiameter) || outerDiameter <= 0) {
    throw new Error(`buildRingGasket: outerDiameter must be positive (got ${outerDiameter})`)
  }
  if (!Number.isFinite(innerDiameter) || innerDiameter <= 0) {
    throw new Error(`buildRingGasket: innerDiameter must be positive (got ${innerDiameter})`)
  }
  if (innerDiameter >= outerDiameter) {
    throw new Error(
      `buildRingGasket: innerDiameter (${innerDiameter}) must be < outerDiameter (${outerDiameter})`
    )
  }
  if (!Number.isFinite(chordDeviation) || chordDeviation <= 0) {
    throw new Error(
      `buildRingGasket: chordDeviation must be a positive finite number (got ${chordDeviation})`
    )
  }

  // Outer CCW + hole CW: see `sanitize-polygon-with-holes.ts` for the
  // canonical wire-contract orientation. jagua-rs's adapter and the
  // free-roam collision hole-void semantics both depend on this.
  const outer = tessellateCircleAt(0, 0, outerDiameter / 2, chordDeviation, "ccw")
  const inner = tessellateCircleAt(0, 0, innerDiameter / 2, chordDeviation, "cw")
  return { outer, holes: [inner] }
}
