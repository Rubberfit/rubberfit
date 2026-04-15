// Greedy bottom-left NFP placer for identical shape packing
//
// NFP computation adapted from the vendored Fit packer library:
//   nesting/vendor/fit/ — see nesting/README.md for source details
//   Uses minkowskiDifference() and noFitRectanglePolygon() from vendor/fit/util.ts
//   Clipper boolean operations via clipper-lib (already a project dependency)
//
// Placement strategy: deterministic greedy bottom-left scan.
//   For N identical shapes, computes only 2 NFPs total (bin-part + part-part),
//   then places each item at the leftmost-bottommost valid position.

import ClipperLib from "clipper-lib"
import type { Point2D, Polygon2D } from "./types"
import { convexHull, convexPolygonsOverlap, polygonArea } from "./convex-hull"
import Part from "./vendor/fit/part"
import Bin from "./vendor/fit/bin"
import Vector from "./vendor/fit/vector"
import {
  minkowskiDifference,
  noFitRectanglePolygon,
  offsetPolygon,
  clipperScale,
  clipperThreshold,
  toClipperCoordinates,
  toNestCoordinates,
} from "./vendor/fit/util"

export interface GreedyPlacement {
  x: number
  y: number
  rotation: number
  placedPolygon: Point2D[]
  width: number
  height: number
}

export interface GreedyPackResult {
  placements: GreedyPlacement[]
  placed: number
  overflow: number
  usedArea: number
  occupiedWidth: number
  occupiedHeight: number
}

function pointsToVectors(points: ReadonlyArray<Point2D>): Vector[] {
  return points.map((p) => new Vector(p.x, p.y))
}

function rotatePoints(points: ReadonlyArray<Point2D>, angle: number): Point2D[] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return points.map((p) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }))
}

function normalizeToOrigin(points: Point2D[]): {
  points: Point2D[]
  offsetX: number
  offsetY: number
} {
  let minX = Infinity
  let minY = Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
  }
  return {
    points: points.map((p) => ({ x: p.x - minX, y: p.y - minY })),
    offsetX: minX,
    offsetY: minY,
  }
}

function getBounds(points: ReadonlyArray<Point2D>): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Run greedy bottom-left NFP packing for a single rotation angle.
 * Returns placements or null if no items fit.
 */
interface PartPartNfpCache {
  /** Minkowski(A_0, A_0) with the angle-0 first-point offset stripped off */
  corePolygons: Point2D[][]
  /** First point of the angle-0 normalized (offset-applied) part */
  basePartFirst: Point2D
}

// eslint-disable-next-line complexity -- NFP placement algorithm with nested Clipper operations
function packWithRotation(
  originalPoints: ReadonlyArray<Point2D>,
  hullPoints: ReadonlyArray<Point2D>,
  binWidth: number,
  binHeight: number,
  qty: number,
  spacing: number,
  rotation: number,
  partPartNfpCache: PartPartNfpCache
): GreedyPlacement[] | null {
  // Rotate and normalize the hull
  const rotated = rotatePoints(hullPoints, rotation)
  const norm = normalizeToOrigin(rotated)
  const hull = norm.points

  // Also rotate and normalize the original polygon (for rendering)
  const rotatedOriginal = rotatePoints(originalPoints, rotation)
  const normOrig = normalizeToOrigin(rotatedOriginal)
  const origPoly = normOrig.points

  // Convex hull of origPoly for SAT overlap checks (SAT requires convex polygons;
  // using hull also prevents non-convex shapes from interlocking through concave voids)
  const origHull = convexHull(origPoly)
  const placedHulls: Point2D[][] = []

  // Create Part and Bin for NFP computation
  const partVectors = pointsToVectors(hull)
  let part = new Part("shape", partVectors)
  const bin = new Bin("bin", binWidth, binHeight)

  // Apply spacing offset
  if (spacing > 0) {
    part = offsetPolygon(part, spacing) as Part
  }

  // Compute inner NFP: where the part can be placed inside the bin
  // (bin is axis-aligned and fixed, but the part rotates — so this must stay per-angle)
  const binNfp = noFitRectanglePolygon(bin, part)
  if (!binNfp) return null

  const clipperBinNfp = [toClipperCoordinates(binNfp.points)]

  // Part-part NFP via rotation equivariance: Minkowski(R·A, R·A) = R · Minkowski(A, A)
  // for identical shapes. Rotate the cached angle-0 core, then add the rotated part's
  // first-point offset to match what minkowskiDifference() would have returned directly.
  const cosR = Math.cos(rotation)
  const sinR = Math.sin(rotation)
  const partFirst = part.points[0]
  const partPartNfp = partPartNfpCache.corePolygons.map((core) => ({
    points: core.map(
      (pt) =>
        new Vector(
          pt.x * cosR - pt.y * sinR + partFirst.x,
          pt.x * sinR + pt.y * cosR + partFirst.y
        )
    ),
  }))
  if (partPartNfp.length === 0) return null

  const placements: GreedyPlacement[] = []

  for (let i = 0; i < qty; i++) {
    if (i === 0) {
      // First placement: leftmost point on the bin NFP
      let bestX = Infinity
      let bestY = Infinity
      for (const pt of binNfp.points) {
        const px = pt.x - part.points[0].x
        const py = pt.y - part.points[0].y
        if (px < bestX || (Math.abs(px - bestX) < 0.001 && py < bestY)) {
          bestX = px
          bestY = py
        }
      }

      const placedPoly = origPoly.map((p) => ({ x: p.x + bestX, y: p.y + bestY }))
      placedHulls.push(origHull.map((p) => ({ x: p.x + bestX, y: p.y + bestY })))
      const bb = getBounds(placedPoly)
      placements.push({
        x: bestX,
        y: bestY,
        rotation,
        placedPolygon: placedPoly,
        width: bb.maxX - bb.minX,
        height: bb.maxY - bb.minY,
      })
      continue
    }

    // Subsequent placements: subtract placed NFPs from valid region
    const clipper = new ClipperLib.Clipper()

    for (let j = 0; j < placements.length; j++) {
      for (const nfp of partPartNfp) {
        let clone = toClipperCoordinates(nfp.points)
        for (let m = 0; m < clone.length; m++) {
          clone[m].X += Math.round(placements[j].x * clipperScale)
          clone[m].Y += Math.round(placements[j].y * clipperScale)
        }
        clone = ClipperLib.Clipper.CleanPolygon(clone, clipperThreshold)
        const area = Math.abs(ClipperLib.Clipper.Area(clone))
        if (clone.length > 2 && area > 0.1 * clipperScale * clipperScale) {
          clipper.AddPath(clone, ClipperLib.PolyType.ptSubject, true)
        }
      }
    }

    // Union all placed NFPs
    const combinedNfp = new ClipperLib.Paths()
    if (
      !clipper.Execute(
        ClipperLib.ClipType.ctUnion,
        combinedNfp,
        ClipperLib.PolyFillType.pftNonZero,
        ClipperLib.PolyFillType.pftNonZero
      )
    ) {
      break
    }

    // Subtract placed NFPs from bin NFP → valid region
    const finalNfp = new ClipperLib.Paths()
    const clipper2 = new ClipperLib.Clipper()
    clipper2.AddPaths(combinedNfp, ClipperLib.PolyType.ptClip, true)
    clipper2.AddPaths(clipperBinNfp, ClipperLib.PolyType.ptSubject, true)
    if (
      !clipper2.Execute(
        ClipperLib.ClipType.ctDifference,
        finalNfp,
        ClipperLib.PolyFillType.pftNonZero,
        ClipperLib.PolyFillType.pftNonZero
      )
    ) {
      break
    }

    const cleanedNfp = ClipperLib.Clipper.CleanPolygons(finalNfp, clipperThreshold)

    // Collect all candidate positions from valid region vertices
    const candidates: Array<{ x: number; y: number }> = []
    for (const path of cleanedNfp) {
      const area = Math.abs(ClipperLib.Clipper.Area(path))
      if (path.length < 3 || area < 0.1 * clipperScale * clipperScale) continue

      const points = toNestCoordinates(path)
      for (const pt of points) {
        candidates.push({
          x: pt.x - part.points[0].x,
          y: pt.y - part.points[0].y,
        })
      }
    }

    // Sort leftmost-bottommost (strict comparison for transitive ordering)
    candidates.sort((a, b) => a.x - b.x || a.y - b.y)

    // Accept first non-overlapping position (SAT on convex hulls — prevents
    // non-convex shapes like cones from interlocking through concave voids)
    let bestX: number | null = null
    let bestY: number | null = null
    for (const cand of candidates) {
      const candidateHull = origHull.map((p) => ({ x: p.x + cand.x, y: p.y + cand.y }))
      let overlaps = false
      for (const prevHull of placedHulls) {
        if (convexPolygonsOverlap(candidateHull, prevHull)) {
          overlaps = true
          break
        }
      }
      if (!overlaps) {
        bestX = cand.x
        bestY = cand.y
        break
      }
    }

    if (bestX === null || bestY === null) break

    const finalX = bestX
    const finalY = bestY
    const placedPoly = origPoly.map((p) => ({ x: p.x + finalX, y: p.y + finalY }))
    placedHulls.push(origHull.map((p) => ({ x: p.x + finalX, y: p.y + finalY })))
    const bb = getBounds(placedPoly)
    placements.push({
      x: finalX,
      y: finalY,
      rotation,
      placedPolygon: placedPoly,
      width: bb.maxX - bb.minX,
      height: bb.maxY - bb.minY,
    })
  }

  return placements.length > 0 ? placements : null
}

/** Compare two packing results: prefer more placements, then tighter bounding box */
function isBetterResult(candidate: GreedyPlacement[], best: GreedyPlacement[]): boolean {
  if (candidate.length > best.length) return true
  if (candidate.length === best.length && best.length > 0) {
    const currentBB = getBoundsFromPlacements(best)
    const newBB = getBoundsFromPlacements(candidate)
    return newBB.area < currentBB.area
  }
  return false
}

/** Default coarse step count — 36 angles = every 10° (fine pass covers gaps) */
const DEFAULT_COARSE_STEPS = 36
/** How many top coarse results to refine */
const FINE_TOP_K = 2
/** Fine pass: ±5° at 1° increments around each top-K seed */
const FINE_RANGE_DEG = 5
const FINE_STEP_DEG = 1
/** Ultra-fine pass: ±1° at 0.25° around the overall best */
const ULTRA_RANGE_DEG = 1
const ULTRA_STEP_DEG = 0.25

const DEG_TO_RAD = Math.PI / 180

/**
 * Remove overlapping placements via convex hull SAT validation.
 * Iterates in placement order, keeping each shape only if its convex hull
 * doesn't overlap any previously accepted hull. Guarantees clean output
 * regardless of NFP/Clipper precision issues.
 */
function removeOverlaps(placements: GreedyPlacement[]): GreedyPlacement[] {
  if (placements.length <= 1) return placements
  const accepted: GreedyPlacement[] = []
  const acceptedHulls: Point2D[][] = []
  for (const p of placements) {
    const hull = convexHull(p.placedPolygon)
    let overlaps = false
    for (const prevHull of acceptedHulls) {
      if (convexPolygonsOverlap(hull, prevHull)) {
        overlaps = true
        break
      }
    }
    if (!overlaps) {
      accepted.push(p)
      acceptedHulls.push(hull)
    }
  }
  return accepted
}

/**
 * Pack qty copies of a polygon onto a bin using greedy bottom-left NFP placement.
 * Uses convex hull for NFP computation (faster than full polygon).
 *
 * Rotation strategy: coarse-to-fine angle search.
 *   1. Coarse pass: `rotationSteps` equally spaced angles (default 36 = every 10°)
 *   2. Fine pass: ±5° at 1° around top 2 coarse results (skipped if coarse placed all qty)
 *   3. Ultra-fine pass: ±1° at 0.25° around the best (skipped if fine placed all qty)
 *
 * Post-placement: removes any overlapping placements via convex hull SAT to guarantee
 * clean output regardless of Clipper precision.
 */
export function greedyNfpPack(
  polygon: Polygon2D,
  binWidth: number,
  binHeight: number,
  qty: number,
  spacing = 0,
  rotationSteps = DEFAULT_COARSE_STEPS
): GreedyPackResult {
  const hull = convexHull(polygon.points)
  const shapeArea = polygonArea(polygon.points)

  // Precompute the part-part NFP at angle 0 ONCE; rotate per-angle inside packWithRotation.
  // This is the single most expensive Clipper call in the hot loop.
  const baseHullNorm = normalizeToOrigin(rotatePoints(hull, 0)).points
  let basePart = new Part("shape", pointsToVectors(baseHullNorm))
  if (spacing > 0) basePart = offsetPolygon(basePart, spacing) as Part
  const baseNfp = minkowskiDifference(basePart, basePart)
  if (baseNfp.length === 0) {
    return {
      placements: [],
      placed: 0,
      overflow: qty,
      usedArea: 0,
      occupiedWidth: 0,
      occupiedHeight: 0,
    }
  }
  const basePartFirst = basePart.points[0]
  // Strip angle-0 first-point offset so we can re-apply the rotated per-angle offset later.
  const partPartNfpCache: PartPartNfpCache = {
    corePolygons: baseNfp.map((poly) =>
      poly.points.map((pt) => ({ x: pt.x - basePartFirst.x, y: pt.y - basePartFirst.y }))
    ),
    basePartFirst,
  }

  const startTime = Date.now()
  const tryAngle = (angle: number): GreedyPlacement[] | null =>
    packWithRotation(
      polygon.points,
      hull,
      binWidth,
      binHeight,
      qty,
      spacing,
      angle,
      partPartNfpCache
    )
  // OPTIMIZATION: THIS IS WHERE THE LONGEST CALCULATIONS TAKE PLACE
  // --- Coarse pass ---
  const coarseResults: Array<{ angle: number; placements: GreedyPlacement[] }> = []
  for (let step = 0; step < rotationSteps; step++) {
    const angle = (step / rotationSteps) * Math.PI * 2
    const result = tryAngle(angle)
    if (result && result.length > 0) {
      coarseResults.push({ angle, placements: result })
    }
  }
  const endTime = Date.now()
  console.log(`Time take: ${endTime - startTime} ms`)
  if (coarseResults.length === 0) {
    return {
      placements: [],
      placed: 0,
      overflow: qty,
      usedArea: 0,
      occupiedWidth: 0,
      occupiedHeight: 0,
    }
  }

  // Sort: most placements first, then tightest bounding box
  coarseResults.sort((a, b) => {
    if (a.placements.length !== b.placements.length)
      return b.placements.length - a.placements.length
    return getBoundsFromPlacements(a.placements).area - getBoundsFromPlacements(b.placements).area
  })

  let bestPlacements = coarseResults[0].placements

  // Skip fine/ultra-fine passes if coarse already placed all requested qty
  if (bestPlacements.length < qty) {
    let bestAngle = coarseResults[0].angle

    // --- Fine pass: ±5° at 1° for top-K seeds ---
    const topK = coarseResults.slice(0, FINE_TOP_K)
    for (const seed of topK) {
      for (let delta = -FINE_RANGE_DEG; delta <= FINE_RANGE_DEG; delta += FINE_STEP_DEG) {
        if (delta === 0) continue // already tested in coarse
        const angle = seed.angle + delta * DEG_TO_RAD
        const result = tryAngle(angle)
        if (result && isBetterResult(result, bestPlacements)) {
          bestPlacements = result
          bestAngle = angle
        }
      }
    }

    // --- Ultra-fine pass: ±1° at 0.25° around the best ---
    if (bestPlacements.length < qty) {
      for (let delta = -ULTRA_RANGE_DEG; delta <= ULTRA_RANGE_DEG; delta += ULTRA_STEP_DEG) {
        if (Math.abs(delta) < 0.01) continue // skip 0
        const angle = bestAngle + delta * DEG_TO_RAD
        const result = tryAngle(angle)
        if (result && isBetterResult(result, bestPlacements)) {
          bestPlacements = result
        }
      }
    }
  }

  // Post-placement safety: remove any overlapping placements caused by Clipper precision
  bestPlacements = removeOverlaps(bestPlacements)

  const placed = bestPlacements.length
  const bb = getBoundsFromPlacements(bestPlacements)

  return {
    placements: bestPlacements,
    placed,
    overflow: Math.max(0, qty - placed),
    usedArea: shapeArea * placed,
    occupiedWidth: bb.width,
    occupiedHeight: bb.height,
  }
}

function getBoundsFromPlacements(placements: GreedyPlacement[]): {
  width: number
  height: number
  area: number
} {
  if (placements.length === 0) return { width: 0, height: 0, area: 0 }
  let maxX = 0
  let maxY = 0
  for (const p of placements) {
    for (const pt of p.placedPolygon) {
      if (pt.x > maxX) maxX = pt.x
      if (pt.y > maxY) maxY = pt.y
    }
  }
  return { width: maxX, height: maxY, area: maxX * maxY }
}
