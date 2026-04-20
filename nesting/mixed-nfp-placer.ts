// Mixed-shape NFP placement.
//
// The single-shape NFP placer (`nfp-greedy-placer.ts`) requires identical
// shapes because the part-part NFP is precomputed once. This module supports
// MIXED shapes by:
//   1. Running the single-shape NFP per spec to find each spec's optimal
//      rotation angle (so each spec's items get tightly-packed orientations).
//   2. Globally placing every rotated item into the stock with bottom-left
//      collision-checked positioning (convex-hull SAT).
//
// Slower than identical-shape NFP, but avoids needing pairwise NFPs across
// every spec combination.
//
// Used by the cut planner when the user mixes cone/trapezoid specs.

import { convexHull, convexPolygonsOverlap, polygonArea } from "./convex-hull"
import { greedyNfpPack } from "./nfp-greedy-placer"
import type { Point2D, Polygon2D } from "./types"

/** One unique cone/trapezoid spec with its base (unrotated) polygon */
export interface MixedSpec<TMeta = unknown> {
  meta: TMeta
  basePolygon: Point2D[]
  quantity: number
}

export interface MixedPlacement<TMeta = unknown> {
  meta: TMeta
  x: number
  y: number
  rotation: number
  width: number
  height: number
  placedPolygon: Point2D[]
  hull: Point2D[]
}

export interface MixedPackResult<TMeta = unknown> {
  placements: MixedPlacement<TMeta>[]
  overflow: number
  usedArea: number
}

const NFP_DEFAULT_SPACING = 0.125
const NFP_COARSE_STEPS = 36

function rotatePoints(points: ReadonlyArray<Point2D>, angle: number): Point2D[] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return points.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }))
}

function normalizeToOrigin(points: Point2D[]): Point2D[] {
  let minX = Infinity
  let minY = Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
  }
  return points.map((p) => ({ x: p.x - minX, y: p.y - minY }))
}

function getBounds(points: ReadonlyArray<Point2D>): { width: number; height: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { width: maxX - minX, height: maxY - minY }
}

/**
 * Run single-shape NFP on each spec to find its best rotation angle.
 * Returns one rotation per spec; per-spec quantities are passed in but only
 * used so NFP tries to actually pack multiple copies (a single-copy run can
 * pick a degenerate angle).
 */
function findBestRotationsPerSpec<TMeta>(
  specs: MixedSpec<TMeta>[],
  binW: number,
  binH: number
): number[] {
  return specs.map((spec) => {
    const polygon: Polygon2D = { id: "spec", points: spec.basePolygon }
    const result = greedyNfpPack(
      polygon,
      binW,
      binH,
      Math.max(1, spec.quantity),
      NFP_DEFAULT_SPACING,
      NFP_COARSE_STEPS
    )
    return result.placements[0]?.rotation ?? 0
  })
}

interface OrientationVariant {
  rotation: number
  rotatedPolygon: Point2D[]
  hull: Point2D[]
  width: number
  height: number
}

interface ItemToPlace<TMeta> {
  meta: TMeta
  variants: OrientationVariant[]
  area: number
}

function buildOrientationVariants(
  basePolygon: ReadonlyArray<Point2D>,
  baseRotation: number
): OrientationVariant[] {
  // Offer the NFP-chosen rotation plus a 180° flip so identical shapes (e.g.
  // two 150° sectors) can interlock apex-to-apex rather than stacking at the
  // same orientation.
  const offsets = [0, Math.PI]
  return offsets.map((off) => {
    const rotation = baseRotation + off
    const rotated = normalizeToOrigin(rotatePoints(basePolygon, rotation))
    const hull = convexHull(rotated)
    const { width, height } = getBounds(rotated)
    return { rotation, rotatedPolygon: rotated, hull, width, height }
  })
}

/**
 * Shared placement loop — given per-spec rotations, build items with alternate
 * orientation variants and run bottom-left collision-checked placement. Each
 * item can pick any variant; the placer prefers whichever variant fits lowest
 * and leftmost, enabling flip-nesting between copies of the same spec.
 */
function placeMixedItemsWithRotations<TMeta>(
  specs: MixedSpec<TMeta>[],
  rotations: number[],
  rollW: number,
  rollH: number
): MixedPackResult<TMeta> {
  const items: ItemToPlace<TMeta>[] = []
  for (let i = 0; i < specs.length; i++) {
    const { meta, basePolygon, quantity } = specs[i]
    const variants = buildOrientationVariants(basePolygon, rotations[i])
    const area = polygonArea(basePolygon)
    for (let q = 0; q < Math.max(1, quantity); q++) {
      items.push({ meta, variants, area })
    }
  }

  // Sort by largest first-variant AABB (stable-enough size ordering).
  items.sort(
    (a, b) =>
      b.variants[0].width * b.variants[0].height - a.variants[0].width * a.variants[0].height
  )

  const placements: MixedPlacement<TMeta>[] = []
  let usedArea = 0
  for (const item of items) {
    let best: { variant: OrientationVariant; pos: { x: number; y: number } } | null = null
    for (const variant of item.variants) {
      const pos = findBottomLeftPosition(variant, placements, rollW, rollH)
      if (!pos) continue
      if (
        !best ||
        pos.y < best.pos.y - 0.001 ||
        (Math.abs(pos.y - best.pos.y) < 0.001 && pos.x < best.pos.x - 0.001)
      ) {
        best = { variant, pos }
      }
    }
    if (!best) continue
    const placedPolygon = best.variant.rotatedPolygon.map((p) => ({
      x: p.x + best.pos.x,
      y: p.y + best.pos.y,
    }))
    const hull = best.variant.hull.map((p) => ({
      x: p.x + best.pos.x,
      y: p.y + best.pos.y,
    }))
    placements.push({
      meta: item.meta,
      x: best.pos.x,
      y: best.pos.y,
      rotation: best.variant.rotation,
      width: best.variant.width,
      height: best.variant.height,
      placedPolygon,
      hull,
    })
    usedArea += item.area
  }

  return {
    placements,
    overflow: items.length - placements.length,
    usedArea,
  }
}

/**
 * Find the bottom-left position where `item` doesn't overlap any placed item.
 * Candidate positions: (0,0) plus the right and bottom edges of every placed
 * item AABB. Returns null if no fit.
 */
function findBottomLeftPosition<TMeta>(
  item: { width: number; height: number; hull: ReadonlyArray<Point2D> },
  placements: MixedPlacement<TMeta>[],
  rollW: number,
  rollH: number
): { x: number; y: number } | null {
  const candidates: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }]
  for (const p of placements) {
    candidates.push({ x: p.x + p.width, y: p.y })
    candidates.push({ x: p.x, y: p.y + p.height })
  }
  candidates.sort((a, b) => a.y - b.y || a.x - b.x)

  for (const cand of candidates) {
    if (cand.x < -0.001 || cand.y < -0.001) continue
    if (cand.x + item.width > rollW + 0.001) continue
    if (cand.y + item.height > rollH + 0.001) continue

    const hull = item.hull.map((p) => ({ x: p.x + cand.x, y: p.y + cand.y }))
    let overlaps = false
    for (const placed of placements) {
      if (convexPolygonsOverlap(hull, placed.hull)) {
        overlaps = true
        break
      }
    }
    if (!overlaps) return cand
  }
  return null
}

/**
 * Pack mixed cone/trapezoid specs into a single sheet with per-spec NFP
 * rotation and global collision-checked placement.
 *
 * Returns placements in the order they were placed (largest area first).
 */
export function packMixedNfp<TMeta>(
  specs: MixedSpec<TMeta>[],
  rollW: number,
  rollH: number
): MixedPackResult<TMeta> {
  if (specs.length === 0 || rollW <= 0 || rollH <= 0) {
    return { placements: [], overflow: 0, usedArea: 0 }
  }
  const rotations = findBestRotationsPerSpec(specs, rollW, rollH)
  return placeMixedItemsWithRotations(specs, rotations, rollW, rollH)
}
