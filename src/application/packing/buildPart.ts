// Build a `Part` for the Rust autonester.
//
// Spec-able shapes (rect, circle, trapezoid, ngon, sector) ship the
// `ShapeSpec` only — Rust materialises the polygon at pack time via
// `application::shape_builder::materialise_polygon`. This file used to
// duplicate the rect/circle/trapezoid/ngon polygon math in TS; that
// path was removed to keep one canonical implementation Rust-side.
//
// `Part.polygon` is reserved for raw-geometry callers (DXF imports,
// hand-drawn polygons, etc.) — they ship vertices directly and skip
// the spec dispatch. When both `polygon` and `shapeSpec` are supplied,
// Rust prefers the polygon (see `materialise_polygon`'s short-circuit
// for `Part.polygon.is_some()`).

import type { Part, PolygonWithHoles, ShapeSpec, Point2D } from "@/src/application/packing/types"

export interface BuildPartInput {
  shapeId: string
  quantity: number
  shapeSpec?: ShapeSpec
  allowRotation: boolean
  grainAxis?: "width" | "length" | "none"
  difficulty?: number
  /**
   * Raw-geometry polygon. Either a flat `Point2D[]` (single closed
   * outer loop, no holes — DXF single-loop imports + hand-drawn
   * shapes) or a `PolygonWithHoles` (`{ outer, holes }` — hole-bearing
   * primitives + multi-loop CAD imports). Both forms get translated
   * to bbox-origin and oriented (outer CCW, holes CW) before being
   * handed to Rust.
   */
  polygon?: Point2D[] | PolygonWithHoles
  /**
   * Opaque label echoed onto every produced `Placement.tag`. AutoNest
   * uses the part number ("G2") or a generated letter ("A", "B", …).
   * Rust round-trips this verbatim.
   */
  tag?: string
}

export function buildPart(input: BuildPartInput): Part {
  if (!input.shapeSpec && !input.polygon) {
    throw new Error("buildPart: must provide shapeSpec or polygon")
  }
  return {
    shapeId: input.shapeId,
    quantity: input.quantity,
    polygon: input.polygon ? normalizePolygon(input.polygon) : undefined,
    shapeSpec: input.shapeSpec,
    allowRotation: input.allowRotation,
    grainAxis: input.grainAxis,
    difficulty: input.difficulty,
    tag: input.tag,
  }
}

function normalizePolygon(input: Point2D[] | PolygonWithHoles): PolygonWithHoles {
  const outerInput = Array.isArray(input) ? input : input.outer
  if (outerInput.length < 3) {
    throw new Error("polygon: must have at least 3 vertices")
  }
  const minX = Math.min(...outerInput.map((p) => p.x))
  const minY = Math.min(...outerInput.map((p) => p.y))
  const translated = outerInput.map((p) => ({ x: p.x - minX, y: p.y - minY }))
  // buildPart only ingests a flat single-loop polygon today (DXF
  // single-loop imports + hand-drawn shapes). Hole-bearing template
  // inputs come through structurally but holes are reserved for the
  // multi-loop PR — for now we wrap to the structured form with no
  // holes so downstream consumers see the new contract without the
  // Rust packer changing behaviour.
  return { outer: ensureCCW(translated), holes: [] }
}

function ensureCCW(points: Point2D[]): Point2D[] {
  // Signed area on screen coords: positive == CW. Reverse to get CCW in math coords.
  let signed = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    signed += (b.x - a.x) * (b.y + a.y)
  }
  return signed > 0 ? [...points].reverse() : points
}
