import type { Point2D } from "./types"

/** Rectangle → 4 vertices */
export function rectToPolygon(width: number, height: number): Point2D[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
}

/** Circle → N-gon approximation */
export function circleToPolygon(diameter: number, segments = 24): Point2D[] {
  const r = diameter / 2
  return Array.from({ length: segments }, (_, i) => {
    const angle = (2 * Math.PI * i) / segments
    return { x: r + r * Math.cos(angle), y: r + r * Math.sin(angle) }
  })
}

/** Trapezoid → 4 vertices with insets for tapered edges */
export function trapezoidToPolygon(
  topWidth: number,
  bottomWidth: number,
  height: number
): Point2D[] {
  const maxW = Math.max(topWidth, bottomWidth)
  const topInset = (maxW - topWidth) / 2
  const botInset = (maxW - bottomWidth) / 2
  return [
    { x: topInset, y: 0 },
    { x: maxW - topInset, y: 0 },
    { x: maxW - botInset, y: height },
    { x: botInset, y: height },
  ]
}

/** Annular sector → outer arc + inner arc (reversed) polygon approximation */
export function sectorToPolygon(
  innerRadius: number,
  outerRadius: number,
  arcDegrees: number,
  segments = 24
): Point2D[] {
  const arcRad = (arcDegrees * Math.PI) / 180
  const points: Point2D[] = []

  // Center the sector vertically: arc spans from -arcRad/2 to +arcRad/2
  // Origin at (outerRadius, outerRadius) so all points are positive
  // Outer arc (forward)
  for (let i = 0; i <= segments; i++) {
    const angle = -arcRad / 2 + (arcRad * i) / segments
    points.push({
      x: outerRadius + outerRadius * Math.sin(angle),
      y: outerRadius - outerRadius * Math.cos(angle),
    })
  }
  segments = 16
  // Inner arc (reverse)
  for (let i = segments; i >= 0; i--) {
    const angle = -arcRad / 2 + (arcRad * i) / segments
    points.push({
      x: outerRadius + innerRadius * Math.sin(angle),
      y: outerRadius - innerRadius * Math.cos(angle),
    })
  }
  return points
}
