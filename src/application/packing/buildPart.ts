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
  const holesInput = Array.isArray(input) ? [] : input.holes
  if (outerInput.length < 3) {
    throw new Error("polygon: must have at least 3 vertices")
  }
  const minX = Math.min(...outerInput.map((p) => p.x))
  const minY = Math.min(...outerInput.map((p) => p.y))
  // Hole-bearing inputs (multi-loop DXF, primitives with bores) flow
  // through with holes preserved. Outer and every hole get shifted by
  // the SAME bbox offset so their relative position is intact, then
  // we enforce the canonical orientation contract (outer CCW, holes
  // CW in math coords — matches `sanitize-polygon-with-holes` and
  // jagua-rs). Degenerate holes (<3 vertices) are dropped silently.
  const translate = (p: Point2D): Point2D => ({ x: p.x - minX, y: p.y - minY })
  const translatedOuter = outerInput.map(translate)
  const translatedHoles = holesInput.map((hole) => hole.map(translate))
  return {
    outer: ensureCCW(translatedOuter),
    holes: translatedHoles.filter((hole) => hole.length >= 3).map(ensureCW),
  }
}

// Signed area on screen coords: positive == CW (equivalently, math-coord
// signed area is negative — the two conventions are sign-flipped via the
// shoelace identity). We keep the screen-coord form here so both
// orientation helpers share one cheap formulation.
function screenSignedArea(points: Point2D[]): number {
  let signed = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    signed += (b.x - a.x) * (b.y + a.y)
  }
  return signed
}

function ensureCCW(points: Point2D[]): Point2D[] {
  // screen signed > 0 ⇒ CW ⇒ reverse to get CCW in math coords.
  return screenSignedArea(points) > 0 ? [...points].reverse() : points
}

function ensureCW(points: Point2D[]): Point2D[] {
  // screen signed < 0 ⇒ CCW ⇒ reverse to get CW in math coords.
  return screenSignedArea(points) < 0 ? [...points].reverse() : points
}
