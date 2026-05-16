// Shared geometry helpers for `PolygonWithHoles` templates. Used by the
// parts-queue thumbnail, the requested-area math in `cut-planner-utils`,
// and any other callsite that needs bbox / net-area off a polygon
// template without duplicating the loop. Keeps `signedArea` private
// so callers don't accidentally bake winding-direction assumptions
// into business logic — net area is what they want.

import type { PolygonWithHoles, Point2D } from "@/src/application/packing/types"

export interface PolygonBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
}

export function getPolygonBounds(polygon: PolygonWithHoles): PolygonBounds {
  // Empty outer → return a zero-extent bbox at the origin rather than
  // letting `Infinity` / `-Infinity` leak into downstream width/height
  // math (NaN-producing subtractions, broken SVG viewBoxes, etc.).
  if (polygon.outer.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 }
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of polygon.outer) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}

export function polygonNetArea(polygon: PolygonWithHoles): number {
  const outerArea = Math.abs(signedArea(polygon.outer))
  const holesArea = polygon.holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0)
  // Clamp at the source: malformed inputs where holes claim more area
  // than the outer ring would otherwise return a negative number and
  // poison downstream sqft math (requested-area totals, utilization
  // ratios). Better to return 0 than propagate the sign error.
  return Math.max(0, outerArea - holesArea)
}

function signedArea(loop: Point2D[]): number {
  let area = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}
