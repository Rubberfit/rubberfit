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
import type { Point2D } from "@/src/application/packing/types"

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
      expect(signedArea(result!.outer)).toBeGreaterThan(0)
    })

    it("emits each hole with negative signed area (CW math, opposite of outer)", () => {
      // Input outer CCW, hole CCW (wrong) → hole must be flipped to CW.
      const result = sanitizePolygonWithHoles({
        outer: SQUARE_CCW,
        holes: [INNER_SQUARE_CCW],
      })
      expect(result).not.toBeNull()
      expect(signedArea(result!.outer)).toBeGreaterThan(0)
      expect(signedArea(result!.holes[0])).toBeLessThan(0)
    })

    it("preserves orientation when input already matches the contract", () => {
      const result = sanitizePolygonWithHoles({
        outer: SQUARE_CCW,
        holes: [[...INNER_SQUARE_CCW].reverse()],
      })
      expect(result).not.toBeNull()
      expect(signedArea(result!.outer)).toBeGreaterThan(0)
      expect(signedArea(result!.holes[0])).toBeLessThan(0)
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
      expect(result!.outer.length).toBeLessThanOrEqual(4)
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
      expect(result!.holes).toHaveLength(1)
    })

    it("accepts an empty holes array (outer-only shape)", () => {
      const result = sanitizePolygonWithHoles({ outer: SQUARE_CCW, holes: [] })
      expect(result).not.toBeNull()
      expect(result!.holes).toHaveLength(0)
    })

    it("accepts an undefined/missing holes field (zod default-empty case)", () => {
      const result = sanitizePolygonWithHoles({
        outer: SQUARE_CCW,
      } as { outer: Point2D[]; holes: Point2D[][] })
      expect(result).not.toBeNull()
      expect(result!.holes).toHaveLength(0)
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
      const second = sanitizePolygonWithHoles(first!)
      expect(second).not.toBeNull()
      expect(second!.outer.length).toBe(first!.outer.length)
      expect(second!.holes.length).toBe(first!.holes.length)
      expect(signedArea(second!.outer)).toBeCloseTo(signedArea(first!.outer), 6)
    })
  })
})
