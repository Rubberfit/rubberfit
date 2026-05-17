import type { PolygonWithHoles, Point2D } from "@/src/application/packing/types"

import { DEFAULT_CHORD_DEVIATION_IN, tessellateCircleAt } from "./_circle"

export interface FullFaceGasketSpec {
  /** Outer diameter, inches. */
  outerDiameter: number
  /** Bore (central hole) inner diameter, inches. */
  boreInnerDiameter: number
  /** Bolt-circle diameter (center-to-center across the pattern), inches. */
  boltCircleDiameter: number
  /** Number of bolt holes evenly spaced on the BCD. ASME range: 2..32. */
  boltCount: number
  /** Bolt-hole diameter, inches. */
  boltHoleDiameter: number
  /**
   * Starting angle of the first bolt hole (radians, CCW from +x axis).
   * Defaults to 0 (first bolt at 3 o'clock).
   */
  boltStartAngleRad?: number
  /** Chord deviation in inches; default 0.005″ — see RingGasketSpec. */
  chordDeviation?: number
}

const MIN_BOLT_COUNT = 2
const MAX_BOLT_COUNT = 32

export function buildFullFaceGasket(spec: FullFaceGasketSpec): PolygonWithHoles {
  const {
    outerDiameter,
    boreInnerDiameter,
    boltCircleDiameter,
    boltCount,
    boltHoleDiameter,
    boltStartAngleRad = 0,
    chordDeviation = DEFAULT_CHORD_DEVIATION_IN,
  } = spec

  validate({
    outerDiameter,
    boreInnerDiameter,
    boltCircleDiameter,
    boltCount,
    boltHoleDiameter,
    boltStartAngleRad,
    chordDeviation,
  })

  const outer = tessellateCircleAt(0, 0, outerDiameter / 2, chordDeviation, "ccw")
  const bore = tessellateCircleAt(0, 0, boreInnerDiameter / 2, chordDeviation, "cw")

  const boltHoles: Point2D[][] = []
  const bcdRadius = boltCircleDiameter / 2
  const boltHoleRadius = boltHoleDiameter / 2
  const stepRad = (2 * Math.PI) / boltCount
  for (let i = 0; i < boltCount; i++) {
    const a = boltStartAngleRad + i * stepRad
    const cx = bcdRadius * Math.cos(a)
    const cy = bcdRadius * Math.sin(a)
    boltHoles.push(tessellateCircleAt(cx, cy, boltHoleRadius, chordDeviation, "cw"))
  }

  return { outer, holes: [bore, ...boltHoles] }
}

interface ValidationInput {
  outerDiameter: number
  boreInnerDiameter: number
  boltCircleDiameter: number
  boltCount: number
  boltHoleDiameter: number
  boltStartAngleRad?: number
  chordDeviation?: number
}

function validate(s: ValidationInput): void {
  const { outerDiameter, boreInnerDiameter, boltCircleDiameter, boltCount, boltHoleDiameter } = s
  for (const [name, v] of [
    ["outerDiameter", outerDiameter],
    ["boreInnerDiameter", boreInnerDiameter],
    ["boltCircleDiameter", boltCircleDiameter],
    ["boltHoleDiameter", boltHoleDiameter],
  ] as const) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error(`buildFullFaceGasket: ${name} must be positive (got ${v})`)
    }
  }
  if (!Number.isInteger(boltCount) || boltCount < MIN_BOLT_COUNT || boltCount > MAX_BOLT_COUNT) {
    throw new Error(
      `buildFullFaceGasket: boltCount must be an integer in [${MIN_BOLT_COUNT}, ${MAX_BOLT_COUNT}] (got ${boltCount})`
    )
  }
  if (s.boltStartAngleRad !== undefined && !Number.isFinite(s.boltStartAngleRad)) {
    throw new Error(
      `buildFullFaceGasket: boltStartAngleRad must be finite (got ${s.boltStartAngleRad})`
    )
  }
  if (
    s.chordDeviation !== undefined &&
    (!Number.isFinite(s.chordDeviation) || s.chordDeviation <= 0)
  ) {
    throw new Error(
      `buildFullFaceGasket: chordDeviation must be a positive finite number (got ${s.chordDeviation})`
    )
  }
  // BCD + bolt-hole radius must fit inside OD.
  if (boltCircleDiameter / 2 + boltHoleDiameter / 2 > outerDiameter / 2) {
    throw new Error(
      `buildFullFaceGasket: bolt circle + bolt holes exceed outer diameter (BCD ${boltCircleDiameter}, bolt ⌀ ${boltHoleDiameter}, OD ${outerDiameter})`
    )
  }
  // Bore must clear the BCD inner edge with strict gap (>= would let
  // the bore tangent the bolt holes — geometrically degenerate, packer
  // chokes on touching boundaries).
  if (boreInnerDiameter / 2 >= boltCircleDiameter / 2 - boltHoleDiameter / 2) {
    throw new Error(
      `buildFullFaceGasket: bore overlaps bolt holes (bore ⌀ ${boreInnerDiameter}, BCD ${boltCircleDiameter}, bolt ⌀ ${boltHoleDiameter})`
    )
  }
}
