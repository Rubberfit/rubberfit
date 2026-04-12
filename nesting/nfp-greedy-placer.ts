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
import { convexHull, polygonArea } from "./convex-hull"
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

function normalizeToOrigin(points: Point2D[]): { points: Point2D[]; offsetX: number; offsetY: number } {
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

function getBounds(points: ReadonlyArray<Point2D>): { minX: number; minY: number; maxX: number; maxY: number } {
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
// eslint-disable-next-line complexity -- NFP placement algorithm with nested Clipper operations
function packWithRotation(
  originalPoints: ReadonlyArray<Point2D>,
  hullPoints: ReadonlyArray<Point2D>,
  binWidth: number,
  binHeight: number,
  qty: number,
  spacing: number,
  rotation: number
): GreedyPlacement[] | null {
  // Rotate and normalize the hull
  const rotated = rotatePoints(hullPoints, rotation)
  const norm = normalizeToOrigin(rotated)
  const hull = norm.points

  // Also rotate and normalize the original polygon (for rendering)
  const rotatedOriginal = rotatePoints(originalPoints, rotation)
  const normOrig = normalizeToOrigin(rotatedOriginal)
  const origPoly = normOrig.points

  // Create Part and Bin for NFP computation
  const partVectors = pointsToVectors(hull)
  let part = new Part("shape", partVectors)
  const bin = new Bin("bin", binWidth, binHeight)

  // Apply spacing offset
  if (spacing > 0) {
    part = offsetPolygon(part, spacing) as Part
  }

  // Compute inner NFP: where the part can be placed inside the bin
  const binNfp = noFitRectanglePolygon(bin, part)
  if (!binNfp) return null

  const clipperBinNfp = [toClipperCoordinates(binNfp.points)]

  // Compute part-part NFP: exclusion zone around each placed part
  const partPartNfp = minkowskiDifference(part, part)
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

    // Find leftmost-bottommost valid vertex
    let bestX: number | null = null
    let bestY: number | null = null

    for (const path of cleanedNfp) {
      const area = Math.abs(ClipperLib.Clipper.Area(path))
      if (path.length < 3 || area < 0.1 * clipperScale * clipperScale) continue

      const points = toNestCoordinates(path)
      for (const pt of points) {
        const px = pt.x - part.points[0].x
        const py = pt.y - part.points[0].y
        if (bestX === null || bestY === null || px < bestX - 0.001 || (Math.abs(px - bestX) < 0.001 && py < bestY)) {
          bestX = px
          bestY = py
        }
      }
    }

    if (bestX === null || bestY === null) break

    const finalX = bestX
    const finalY = bestY
    const placedPoly = origPoly.map((p) => ({ x: p.x + finalX, y: p.y + finalY }))
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

/**
 * Pack qty copies of a polygon onto a bin using greedy bottom-left NFP placement.
 * Uses convex hull for NFP computation (faster than full polygon).
 * Tries multiple rotations, returns the best result.
 */
export function greedyNfpPack(
  polygon: Polygon2D,
  binWidth: number,
  binHeight: number,
  qty: number,
  spacing = 0,
  rotationSteps = 4
): GreedyPackResult {
  const hull = convexHull(polygon.points)
  const shapeArea = polygonArea(polygon.points)

  let bestPlacements: GreedyPlacement[] = []

  for (let step = 0; step < rotationSteps; step++) {
    const angle = (step / rotationSteps) * Math.PI * 2
    const result = packWithRotation(polygon.points, hull, binWidth, binHeight, qty, spacing, angle)
    if (result && result.length > bestPlacements.length) {
      bestPlacements = result
    } else if (result && result.length === bestPlacements.length) {
      // Same count: prefer tighter bounding box
      const currentBB = getBoundsFromPlacements(bestPlacements)
      const newBB = getBoundsFromPlacements(result)
      if (newBB.area < currentBB.area) {
        bestPlacements = result
      }
    }
  }

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
