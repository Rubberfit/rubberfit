// PR 0b — sanitize-polygon-with-holes is the single ingress sanitiser
// for incoming CAD geometry (PR A DXF, PR B SVG, PR C gasket
// primitives). These tests pin the four guarantees the helper makes
// to its callers:
//   1. Vertex dedup — consecutive near-duplicate vertices collapse.
//   2. Self-intersection repair — figure-8 or overlap-encoded outer
//      rings either split into a clean polygon-with-holes or are
//      rejected outright (returns null) when the geometric intent
//      is ambiguous.
//   3. Orientation contract — outer ring CCW in math coords (positive
//      signed area), every hole CW (opposite winding). Matches
//      `buildPart`'s `normalizePolygon` for the single-loop path.
//   4. Degenerate input rejection — missing outer, < 3 outer vertices,
//      or geometry that collapses entirely returns null.

import { describe, expect, it } from "vitest"

import { sanitizePolygonWithHoles } from "@/src/application/cad/sanitize-polygon-with-holes"
import type { Point2D, PolygonWithHoles } from "@/src/application/packing/types"
import { assertNotNull } from "../_helpers/assert-not-null"

function signedArea(points: ReadonlyArray<Point2D>): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

const SQUARE_CCW = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

const INNER_SQUARE_CCW = [
  { x: 3, y: 3 },
  { x: 7, y: 3 },
  { x: 7, y: 7 },
  { x: 3, y: 7 },
]

describe("sanitizePolygonWithHoles", () => {
  describe("orientation enforcement", () => {
    it("emits outer with positive signed area (CCW math)", () => {
      // Input CW outer → must be flipped to CCW math.
      const cwOuter = [...SQUARE_CCW].reverse()
      const result = sanitizePolygonWithHoles({ outer: cwOuter, holes: [] })
      expect(result).not.toBeNull()
      assertNotNull(result)
      expect(signedArea(result.outer)).toBeGreaterThan(0)
    })

    it("emits each hole with negative signed area (CW math, opposite of outer)", () => {
      // Input outer CCW, hole CCW (wrong) → hole must be flipped to CW.
      const result = sanitizePolygonWithHoles({
        outer: SQUARE_CCW,
        holes: [INNER_SQUARE_CCW],
      })
      expect(result).not.toBeNull()
      assertNotNull(result)
      expect(signedArea(result.outer)).toBeGreaterThan(0)
      expect(signedArea(result.holes[0])).toBeLessThan(0)
    })

    it("preserves orientation when input already matches the contract", () => {
      const result = sanitizePolygonWithHoles({
        outer: SQUARE_CCW,
        holes: [[...INNER_SQUARE_CCW].reverse()],
      })
      expect(result).not.toBeNull()
      assertNotNull(result)
      expect(signedArea(result.outer)).toBeGreaterThan(0)
      expect(signedArea(result.holes[0])).toBeLessThan(0)
    })
  })

  describe("vertex dedup", () => {
    it("collapses near-duplicate consecutive vertices", () => {
      // Insert a vertex 1e-8 inches away from an existing corner —
      // below the helper's 1e-4 tolerance.
      const polluted = [
        { x: 0, y: 0 },
        { x: 1e-8, y: 1e-8 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]
      const result = sanitizePolygonWithHoles({ outer: polluted, holes: [] })
      expect(result).not.toBeNull()
      assertNotNull(result)
      expect(result.outer.length).toBeLessThanOrEqual(4)
    })
  })

  describe("hole input handling", () => {
    it("drops degenerate (< 3 vertex) hole rings", () => {
      const result = sanitizePolygonWithHoles({
        outer: SQUARE_CCW,
        holes: [
          INNER_SQUARE_CCW,
          [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        ],
      })
      expect(result).not.toBeNull()
      assertNotNull(result)
      expect(result.holes).toHaveLength(1)
    })

    it("accepts an empty holes array (outer-only shape)", () => {
      const result = sanitizePolygonWithHoles({ outer: SQUARE_CCW, holes: [] })
      expect(result).not.toBeNull()
      assertNotNull(result)
      expect(result.holes).toHaveLength(0)
    })

    it("accepts an undefined/missing holes field (zod default-empty case)", () => {
      // PolygonWithHoles types `holes` as required, but the runtime
      // sanitizer must also handle the zod-parsed-without-default
      // path that produces `{ outer, holes: undefined }`. We exercise
      // that runtime branch (`input.holes ?? []` inside the helper)
      // — which means deliberately constructing input that the type
      // system says is invalid. This is the system-boundary cast
      // CLAUDE.md carves out for: simulating a parsed-input shape
      // that's wider than the static type. Without this case the
      // `?? []` line in the implementation is untested.
      const inputWithUndefinedHoles = { outer: SQUARE_CCW } as unknown as PolygonWithHoles
      const result = sanitizePolygonWithHoles(inputWithUndefinedHoles)
      expect(result).not.toBeNull()
      assertNotNull(result)
      expect(result.holes).toHaveLength(0)
    })
  })

  describe("hole containment", () => {
    it("rejects a hole whose vertices fall outside the outer (code-reviewer H2)", () => {
      // 10×10 outer with a "hole" sitting at (12, 12)..(15, 15) —
      // entirely outside the outer. The downstream collision path
      // would otherwise treat it as a valid void and accept
      // placements at (12..15, 12..15) as non-colliding even though
      // they're outside the part body.
      const result = sanitizePolygonWithHoles({
        outer: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        holes: [
          [
            { x: 12, y: 12 },
            { x: 15, y: 12 },
            { x: 15, y: 15 },
            { x: 12, y: 15 },
          ],
        ],
      })
      expect(result).toBeNull()
    })

    it("accepts a hole vertex landing within float epsilon of the outer boundary (Sigilix review)", () => {
      // CAD-imported hole rings often have a vertex that lands
      // numerically on the outer edge due to chord-tessellation
      // alignment. Bare ray-casting can flip such a vertex to "outside"
      // based on ray direction + float noise; the inclusive EPS-band
      // boundary check makes the containment contract real.
      const result = sanitizePolygonWithHoles({
        outer: SQUARE_CCW,
        holes: [
          [
            { x: 1, y: 1 },
            { x: 5, y: 1 },
            // This vertex lands within 1e-5 of the outer edge x=10
            { x: 10 - 1e-5, y: 5 },
            { x: 1, y: 5 },
          ],
        ],
      })
      expect(result).not.toBeNull()
      assertNotNull(result)
      expect(result.holes).toHaveLength(1)
    })

    it("accepts a hole whose vertices land exactly on the outer boundary", () => {
      // Edge-sharing hole — the renderer + collision treat this as a
      // no-op (the hole "punches through" but doesn't extend beyond
      // the outer), which is the safe degenerate. Accepting matches
      // the wire contract since Clipper would normalize the topology.
      const result = sanitizePolygonWithHoles({
        outer: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        holes: [
          [
            { x: 0, y: 3 },
            { x: 4, y: 3 },
            { x: 4, y: 7 },
            { x: 0, y: 7 },
          ],
        ],
      })
      expect(result).not.toBeNull()
    })
  })

  describe("rejection cases", () => {
    it("rejects a < 3 vertex outer", () => {
      const result = sanitizePolygonWithHoles({
        outer: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        holes: [],
      })
      expect(result).toBeNull()
    })

    it("rejects a figure-8 outer that splits into disjoint pieces", () => {
      // Two squares connected by a self-crossing — Clipper's even-odd
      // simplifies this to TWO disjoint outer rings, which is
      // geometrically ambiguous (which piece is the "part"?).
      const figureEight = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
        { x: 0, y: 0 },
        { x: 6, y: 6 },
        { x: 10, y: 6 },
        { x: 10, y: 10 },
        { x: 6, y: 10 },
      ]
      const result = sanitizePolygonWithHoles({ outer: figureEight, holes: [] })
      expect(result).toBeNull()
    })
  })

  describe("idempotency", () => {
    it("re-sanitizing a sanitized polygon produces the same shape", () => {
      const first = sanitizePolygonWithHoles({
        outer: SQUARE_CCW,
        holes: [INNER_SQUARE_CCW],
      })
      expect(first).not.toBeNull()
      assertNotNull(first)
      const second = sanitizePolygonWithHoles(first)
      expect(second).not.toBeNull()
      assertNotNull(second)
      expect(second.outer.length).toBe(first.outer.length)
      expect(second.holes.length).toBe(first.holes.length)
      expect(signedArea(second.outer)).toBeCloseTo(signedArea(first.outer), 6)
    })
  })
})
