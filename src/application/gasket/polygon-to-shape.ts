// src/application/gasket/polygon-to-shape.ts
import type { PolygonWithHoles } from "@/src/application/packing/types"
import * as THREE from "three"

export function polygonToShape(polygon: PolygonWithHoles): THREE.Shape {
  const outer = new THREE.Shape(polygon.outer.map((p) => new THREE.Vector2(p.x, p.y)))
  outer.holes = polygon.holes.map(
    (hole) => new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y)))
  )
  return outer
}

export interface PolygonBbox {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  cx: number
  cy: number
}

export function polygonBbox(polygon: PolygonWithHoles): PolygonBbox {
  const allPoints = [polygon.outer, ...polygon.holes].flat()

  if (allPoints.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 1,
      height: 1,
      cx: 0,
      cy: 0,
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const p of allPoints) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  const width = maxX - minX
  const height = maxY - minY

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  }
}
