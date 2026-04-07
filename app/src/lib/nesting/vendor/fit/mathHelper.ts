import Vector from "./vector"
class MathHelper {
  static normalizePolygon(points: Vector[]): Vector[] {
    let cx = 0
    let cy = 0

    // Compute centroid (average of vertices)
    for (let i = 0; i < points.length; i++) {
      cx += points[i].x
      cy += points[i].y
    }

    cx /= points.length
    cy /= points.length

    // Shift all points so centroid is at (0,0)
    return points.map((p) => new Vector(p.x - cx, p.y - cy))
  }
}

export default MathHelper
