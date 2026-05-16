// Convert an unstructured list of closed loops (from `connect-loops.ts`)
// into a list of `DxfPartCandidate`s — one part per "outer + its holes"
// group, with islands inside holes split into separate parts.
//
// Algorithm: containment-graph + even-odd depth.
//
//   1. For every loop A, compute `parent[A]` = the smallest-area loop
//      strictly containing A, or -1 if none. "Strictly contains" is
//      established cheaply (bbox reject) then confirmed by point-in-
//      polygon ray-casting on `A[0]` against the candidate outer.
//
//   2. `depth[A]` = number of ancestors when chasing `parent` to a root.
//      Even depth → outer-of-part (new `DxfPartCandidate`). Odd depth →
//      hole on its immediate parent's part. Islands at depth 2 become
//      the outer of their own part — that's the "nested-holes" case the
//      plan asks for.
//
//   3. Winding contract: CCW outer / CW hole, matching
//      `sanitize-polygon-with-holes.ts`. The sanitizer runs at the
//      DxfReviewDialog confirm seam (Task 7), so what we emit here only
//      needs to be reasonable enough to round-trip through Clipper; we
//      still pre-orient to keep direct downstream consumers (preview
//      thumbnails, debug renderers) sane.
//
// This file is the final assembly stage before `DxfPartCandidate`s reach
// the dialog. Per-loop self-intersection / vertex cleanup is the
// sanitizer's job; we treat each loop as opaque.

import type { Point2D, PolygonWithHoles } from "@/src/application/packing/types"

/**
 * One candidate part for the DxfReviewDialog. Stable `index` so the
 * dialog can key its parts list. `bbox` is the outer ring's min/max in
 * document units (pre-unit-conversion); used for thumbnail framing.
 */
export interface DxfPartCandidate {
  /** 0-indexed position in the returned array; stable. */
  index: number
  polygon: PolygonWithHoles
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
}

type Bbox = { minX: number; minY: number; maxX: number; maxY: number }

export function groupLoopsIntoParts(loops: Point2D[][]): DxfPartCandidate[] {
  // Filter degenerate loops (fewer than 3 vertices). An empty loop crashes
  // `loops[i][0]` access in the parent-assignment scan; a 2-vertex loop
  // emits a line-segment "part" with zero area.
  const validLoops = loops.filter((l) => l.length >= 3)
  if (validLoops.length === 0) return []

  // Precompute bboxes and absolute areas so the O(N^2) containment scan
  // and the smallest-area-parent tiebreak don't repeat work.
  const bboxes: Bbox[] = validLoops.map(computeBbox)
  const areas: number[] = validLoops.map((loop) => Math.abs(signedArea(loop)))

  // Step 1: parent[i] = smallest-area loop strictly containing loops[i],
  // or -1 if none. The strict-area predicate (areas[j] > areas[i]) is
  // the FIRST check: it guarantees the parent relation is acyclic by
  // induction on area, which eliminates the identical-duplicate-loops
  // infinite hang in the depth-chase below (two coincident loops would
  // otherwise classify as mutual parents under inclusive bbox + point-
  // in-polygon at a shared vertex).
  const parent = new Array<number>(validLoops.length).fill(-1)
  for (let i = 0; i < validLoops.length; i++) {
    let smallestArea = Infinity
    for (let j = 0; j < validLoops.length; j++) {
      if (i === j) continue
      if (areas[j] <= areas[i]) continue
      if (!bboxContains(bboxes[j], bboxes[i])) continue
      if (!pointInPolygon(validLoops[i][0], validLoops[j])) continue
      if (areas[j] < smallestArea) {
        smallestArea = areas[j]
        parent[i] = j
      }
    }
  }

  // Step 2: depth via parent-chain. The strict-area predicate above makes
  // cycles impossible (parent area strictly greater than child area, so
  // parent-chain areas form a strictly increasing sequence bounded by
  // `validLoops.length`). The `steps` counter is belt-and-suspenders —
  // if it ever fires it indicates a regression in the strict-area
  // invariant, in which case clamping to depth 0 is safer than hanging.
  const depth = new Array<number>(validLoops.length).fill(0)
  for (let i = 0; i < validLoops.length; i++) {
    let d = 0
    let p = parent[i]
    let steps = 0
    while (p !== -1 && steps < validLoops.length) {
      d++
      p = parent[p]
      steps++
    }
    if (steps >= validLoops.length) {
      // Defensive: should be unreachable given the strict-area predicate.
      // If reached, clamp depth to 0 (treat as top-level outer).
      d = 0
    }
    depth[i] = d
  }

  // Step 3: partition into parts. Even depth → outer-of-part; odd depth
  // → hole on its immediate parent. We do two passes so the part-index
  // map is fully populated before holes are attached.
  const parts: DxfPartCandidate[] = []
  const outerToPart = new Map<number, number>()
  for (let i = 0; i < validLoops.length; i++) {
    if (depth[i] % 2 !== 0) continue
    parts.push({
      index: parts.length,
      polygon: { outer: ensureWinding(validLoops[i], "ccw"), holes: [] },
      bbox: bboxes[i],
    })
    outerToPart.set(i, parts.length - 1)
  }
  for (let i = 0; i < validLoops.length; i++) {
    if (depth[i] % 2 !== 1) continue
    const partIdx = outerToPart.get(parent[i])
    // Orphan hole: parent at odd depth wasn't promoted to outer. Can't
    // happen given the even-odd partition above, but guard anyway —
    // dropping is safer than corrupting an unrelated part.
    if (partIdx === undefined) continue
    parts[partIdx].polygon.holes.push(ensureWinding(validLoops[i], "cw"))
  }

  return parts
}

/**
 * Twice-signed area / 2 (Shoelace). Positive = CCW (math coords, Y up).
 * Negative = CW. Same convention as `sanitize-polygon-with-holes.ts`.
 */
function signedArea(loop: ReadonlyArray<Point2D>): number {
  let sum = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** Reverse the loop in place (via slice) if its winding doesn't match. */
function ensureWinding(loop: Point2D[], winding: "ccw" | "cw"): Point2D[] {
  const area = signedArea(loop)
  const isCcw = area > 0
  if ((winding === "ccw" && isCcw) || (winding === "cw" && !isCcw)) return loop
  return loop.slice().reverse()
}

/** `inner`'s bbox is fully inside `outer`'s bbox (inclusive). */
function bboxContains(outer: Bbox, inner: Bbox): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  )
}

/**
 * Standard even-odd ray-casting (horizontal ray to +X). Treats the
 * boundary as undefined — for the containment-graph use case here, the
 * tested point is always `inner[0]`, and CAD-authored outer/hole loops
 * almost never share a vertex, so the boundary ambiguity doesn't bite
 * in practice. The downstream sanitizer (PR 0b) gets a second pass with
 * an inclusive epsilon-banded variant that absorbs float drift.
 *
 * Edge cases:
 *   - Vertex on the test point's y (a.y === p.y): the half-open
 *     comparison `a.y > p.y !== b.y > p.y` counts one half-edge and
 *     skips the other, preserving the parity.
 *   - Horizontal edge (a.y === b.y): the outer comparison is false for
 *     both endpoints when p.y !== a.y, so the divisor is never
 *     evaluated. When p.y === a.y the comparison is also false (both
 *     sides agree), so horizontal edges contribute zero crossings.
 */
function pointInPolygon(p: Point2D, loop: ReadonlyArray<Point2D>): boolean {
  let inside = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i]
    const b = loop[j]
    const intersect =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

function computeBbox(loop: ReadonlyArray<Point2D>): Bbox {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of loop) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}
