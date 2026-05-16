// Reduce a parsed `SvgDocument` to closed loops + a rejected list.
//
// Mirror of the post-parse stage in DXF (`connect-loops.ts`) — except
// SVG paths already close themselves at the `<path>` `Z` boundary, so
// there is no LINE-endpoint-snap step. The only work here is unpacking
// the per-element loop fields and filtering degenerates.

import type { Point2D, SvgDocument, SvgEntity, SvgRejectedEntity } from "./svg-types"

const DEGENERATE_AREA_TOL = 1e-12

export interface SvgLoopsResult {
  loops: Point2D[][]
  rejected: SvgRejectedEntity[]
}

export function svgEntitiesToLoops(doc: SvgDocument): SvgLoopsResult {
  const loops: Point2D[][] = []
  const rejected: SvgRejectedEntity[] = []

  for (const entity of doc.entities) {
    collectFromEntity(entity, loops, rejected)
  }

  return { loops: loops.filter(isNonDegenerate), rejected }
}

function collectFromEntity(
  entity: SvgEntity,
  loops: Point2D[][],
  rejected: SvgRejectedEntity[]
): void {
  switch (entity.kind) {
    case "path":
      for (const loop of entity.loops) loops.push(loop)
      return
    case "rect":
    case "circle":
    case "ellipse":
    case "polygon":
    case "polyline":
      loops.push(entity.loop)
      return
    case "unsupported":
      rejected.push({ originalType: entity.originalType, reason: entity.reason })
      return
  }
}

function isNonDegenerate(loop: Point2D[]): boolean {
  if (loop.length < 3) return false
  // Shoelace formula — absolute signed area.
  let area = 0
  for (let i = 0, n = loop.length; i < n; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % n]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2 > DEGENERATE_AREA_TOL
}
