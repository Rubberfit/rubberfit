"use client"

import { memo } from "react"
import { Line, Rect } from "react-konva"

import type { LayoutRegion } from "./layout-model"

interface RegionShapeProps {
  region: LayoutRegion
  scale: number
  fill: string
  stroke: string
}

/**
 * Memoized so unchanged scrap regions skip React reconciliation +
 * Konva node updates during drag (issue #117 phase 4). For ~200 scrap
 * strips emitted per drag tick of a 50-part scene, only the regions
 * around the dragged part actually change — the rest hit the memo.
 *
 * Default shallow compare won't work because the `region` object is
 * a fresh `LayoutRegion` each tick (returned from `finalizeRegions`).
 * Custom comparator does a structural compare on geometry — cheap
 * (a few number compares + a vertex loop for polys, ~1μs per region).
 */
const RegionShape = memo(
  function RegionShape({ region, scale, fill, stroke }: RegionShapeProps) {
    if (region.polygon && region.polygon.length >= 3) {
      const points = region.polygon.flatMap((pt) => [pt.x * scale, pt.y * scale])
      return <Line points={points} closed fill={fill} stroke={stroke} strokeWidth={0.5} />
    }
    return (
      <Rect
        x={region.x * scale}
        y={region.y * scale}
        width={region.width * scale}
        height={region.height * scale}
        fill={fill}
        stroke={stroke}
        strokeWidth={0.5}
      />
    )
  },
  (prev, next) => {
    if (prev.scale !== next.scale || prev.fill !== next.fill || prev.stroke !== next.stroke) {
      return false
    }
    const a = prev.region
    const b = next.region
    if (a === b) return true
    if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) return false
    if (a.polygon === b.polygon) return true
    if (a.polygon == null || b.polygon == null) return a.polygon == null && b.polygon == null
    if (a.polygon.length !== b.polygon.length) return false
    for (let i = 0; i < a.polygon.length; i++) {
      const pa = a.polygon[i]
      const pb = b.polygon[i]
      if (pa.x !== pb.x || pa.y !== pb.y) return false
    }
    return true
  }
)

export default RegionShape
