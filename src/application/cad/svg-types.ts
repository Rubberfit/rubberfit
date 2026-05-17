// Narrowed SVG AST.
//
// SVG is XML with a generous shape vocabulary (`<path>`, `<rect>`,
// `<circle>`, `<ellipse>`, `<polygon>`, `<polyline>`, `<line>`) plus
// ancestor `transform` composition and a small set of unsupported
// constructs (`<use>`, `<defs>`, `<text>`, raster `<image>`, gradients,
// masks, clipPaths, patterns, filters).
//
// `parseSvg` resolves the composed transform per element at parse
// time and tessellates curve commands into polylines via the shared
// `tessellate-curves.ts` primitives. Downstream consumers operate on
// closed loops only — `Point2D[]` per loop with no curve data carried
// past this boundary.
//
// Unsupported elements collapse into `UnsupportedSvgEntity` with a
// reason code so the Review dialog can surface specific copy.

import type { Point2D, PolygonWithHoles, UnitSystem } from "@/src/application/packing/types"

export type { Point2D, PolygonWithHoles, UnitSystem }

// All emitted loops are post-transform and Y-flipped to math-coords (Y up).
// `parseSvg` applies the flip via matrix(1, 0, 0, -1, 0, 0) after every
// ancestor transform composition, so SVG output shares the same coordinate
// convention DXF uses downstream. The review-dialog path renderer
// (`cad-review-dialog-parts.tsx`) flips Y back to SVG (Y down) for display.
// Containment + grouping does not care about Y orientation as long as
// it is consistent across all loops in a document.

export interface SvgPathEntity {
  kind: "path"
  /** Closed loops from the `<path>` element's subpaths. Each is a Point2D[]. */
  loops: Point2D[][]
}

export interface SvgRectEntity {
  kind: "rect"
  /** Already in transformed coords; CCW in pre-transform space. */
  loop: Point2D[]
}

export interface SvgCircleEntity {
  kind: "circle"
  /** Always pre-resolved to a polyline loop — the parser handles uniform vs non-uniform transforms. */
  loop: Point2D[]
}

export interface SvgEllipseEntity {
  kind: "ellipse"
  loop: Point2D[]
}

export interface SvgPolygonEntity {
  kind: "polygon"
  loop: Point2D[]
}

export interface SvgPolylineEntity {
  kind: "polyline"
  /** Only emitted when start ≈ end within snap tol; otherwise rejected. */
  loop: Point2D[]
}

/**
 * Reason codes for SVG elements we recognise but cannot process.
 * The Review dialog renders each reason verbatim as operator copy.
 */
export type UnsupportedSvgReason =
  | "use-element-unsupported"
  | "defs-element-unsupported"
  | "text-element-unsupported"
  | "image-element-unsupported"
  | "clip-path-unsupported"
  | "mask-unsupported"
  | "gradient-unsupported"
  | "pattern-unsupported"
  | "filter-unsupported"
  | "foreign-object-unsupported"
  | "open-path-no-z"
  | "polyline-not-closeable"
  | "line-not-closeable"
  | "element-type-unsupported"
  | "path-malformed"

export interface UnsupportedSvgEntity {
  kind: "unsupported"
  originalType: string
  reason: UnsupportedSvgReason
}

export type SvgEntity =
  | SvgPathEntity
  | SvgRectEntity
  | SvgCircleEntity
  | SvgEllipseEntity
  | SvgPolygonEntity
  | SvgPolylineEntity
  | UnsupportedSvgEntity

export interface SvgDocument {
  /**
   * Detected unit system from root `<svg width/height>` suffix or
   * defaults. Undefined when the root uses unit-less user-units or px —
   * the operator picks mm vs inch in the Review dialog.
   */
  detectedUnits: UnitSystem | undefined
  entities: SvgEntity[]
}

/**
 * Operator-facing summary for the SVG part shipped to `templateToPart`.
 * Shape is intentionally identical to `DxfImportedPart` so the wire
 * contract into `buildPart` does not fork. A future PR may rename to
 * `CadImportedPart` once both surfaces stabilise.
 */
export interface SvgImportedPart {
  partNumber: string
  polygon: PolygonWithHoles
  quantity: number
  units: UnitSystem
  sourceFile: string
}

export interface SvgRejectedEntity {
  originalType: string
  reason: UnsupportedSvgReason
}
