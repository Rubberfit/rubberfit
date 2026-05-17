// Parse an SVG document into our narrowed entity union.
//
// svgson hands us an `INode` AST (XML tree). We walk it depth-first,
// composing ancestor `transform` strings (via svgpath) onto each
// renderable element. Curve commands (cubic/quadratic Béziers, arcs
// after `unarc()` expansion) feed `tessellate-curves.ts`. Unsupported
// elements (`<use>`, `<defs>`, `<text>`, raster `<image>`, gradients,
// masks, clipPaths, patterns, filters) collapse into
// `UnsupportedSvgEntity` with a reason code.
//
// Y is flipped at parse time (Y -> -Y) so emitted vertices are in
// math-coords (Y up) — the same convention DXF uses. The review-dialog
// path renderer, the PDF generator, and the packing pipeline all
// assume math-coords; normalising here keeps SVG previews right-side-up
// and avoids per-source-type branches downstream.

import svgpath from "svgpath"
import { parse as parseSvgXml, type INode } from "svgson"

import { tessellateCircle, tessellateEllipse } from "./tessellate-curves"
import { detectSvgUnits } from "./detect-svg-units"
import { finalisePathBuilder, handlePathSegment, newPathBuilderState } from "./svg-path-builder"
import type {
  Point2D,
  SvgDocument,
  SvgEntity,
  UnsupportedSvgEntity,
  UnsupportedSvgReason,
} from "./svg-types"

const POLYLINE_CLOSE_TOLERANCE = 1e-3

export class SvgParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SvgParseError"
  }
}

export async function parseSvg(text: string): Promise<SvgDocument> {
  // svgson's XML reader trips on multi-line comments (`<!-- ... newline ... -->`),
  // which real-world CAD exports include for metadata. Strip every comment
  // before parsing — comments never affect geometry.
  const sanitised = text.replace(/<!--[\s\S]*?-->/g, "")
  let root: INode
  try {
    root = await parseSvgXml(sanitised)
  } catch (error) {
    throw new SvgParseError(
      `Failed to parse SVG: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (root.name !== "svg") {
    throw new SvgParseError(`Expected <svg> root element, got <${root.name}>`)
  }

  const { units, userUnitScale } = detectSvgUnits(root.attributes ?? {})
  const entities: SvgEntity[] = []
  walkNode(root, [], userUnitScale, entities)

  return { detectedUnits: units, entities }
}

// Container-shaped elements whose content does NOT render unless
// referenced elsewhere. `<symbol>` is a definition (per SVG spec, it
// renders only via `<use>` — which we reject — so its content is dead
// weight). `<defs>` is the same shape.
const REJECTED_CONTAINERS = new Set(["defs", "symbol"])

// Container-shaped elements whose content renders inline and carries
// transform composition onto children.
const CONTAINERS = new Set(["svg", "g"])

// Names that emit `UnsupportedSvgEntity` with a fixed reason — no element
// parser, no recursion. Keyed by element tag.
const FIXED_UNSUPPORTED: Record<string, { originalType: string; reason: UnsupportedSvgReason }> = {
  line: { originalType: "line", reason: "line-not-closeable" },
  use: { originalType: "use", reason: "use-element-unsupported" },
  text: { originalType: "text", reason: "text-element-unsupported" },
  tspan: { originalType: "text", reason: "text-element-unsupported" },
  image: { originalType: "image", reason: "image-element-unsupported" },
  clipPath: { originalType: "clipPath", reason: "clip-path-unsupported" },
  mask: { originalType: "mask", reason: "mask-unsupported" },
  linearGradient: { originalType: "linearGradient", reason: "gradient-unsupported" },
  radialGradient: { originalType: "radialGradient", reason: "gradient-unsupported" },
  pattern: { originalType: "pattern", reason: "pattern-unsupported" },
  filter: { originalType: "filter", reason: "filter-unsupported" },
  foreignObject: { originalType: "foreignObject", reason: "foreign-object-unsupported" },
}

// Metadata-only elements that contribute no geometry; silently skipped.
const SILENT = new Set(["style", "title", "desc", "metadata"])

type ElementParser = (
  node: INode,
  composedTransform: string,
  userUnitScale: number
) => SvgEntity | null

const ELEMENT_PARSERS: Record<string, ElementParser> = {
  path: parsePath,
  rect: parseRect,
  circle: parseCircle,
  ellipse: parseEllipse,
  polygon: parsePolygon,
  polyline: parsePolyline,
}

function walkNode(
  node: INode,
  ancestorTransforms: string[],
  userUnitScale: number,
  out: SvgEntity[]
): void {
  if (REJECTED_CONTAINERS.has(node.name)) {
    out.push(unsupported(node.name, rejectedContainerReason(node.name)))
    return
  }
  if (SILENT.has(node.name)) return

  const fixed = FIXED_UNSUPPORTED[node.name]
  if (fixed) {
    out.push(unsupported(fixed.originalType, fixed.reason))
    return
  }

  const elementTransform = node.attributes?.transform
  const transformStack = elementTransform
    ? [...ancestorTransforms, elementTransform]
    : ancestorTransforms

  const parser = ELEMENT_PARSERS[node.name]
  if (parser) {
    pushEntity(out, parser(node, transformStack.join(" "), userUnitScale))
    return
  }

  // Container OR unknown element: recurse children without emitting.
  // `<svg>` / `<g>` / `<symbol>` carry transforms onto children; unknown
  // elements behave the same way for forward-compat with SVG dialects.
  if (CONTAINERS.has(node.name) || node.children?.length) {
    for (const child of node.children ?? []) walkNode(child, transformStack, userUnitScale, out)
  }
}

function rejectedContainerReason(name: string): UnsupportedSvgReason {
  if (name === "defs") return "defs-element-unsupported"
  if (name === "symbol") return "use-element-unsupported"
  return "element-type-unsupported"
}

function pushEntity(out: SvgEntity[], entity: SvgEntity | null): void {
  if (entity !== null) out.push(entity)
}

/* ------------------------------------------------------------------ */
/*  Element parsers                                                    */
/* ------------------------------------------------------------------ */

function parsePath(
  node: INode,
  composedTransform: string,
  userUnitScale: number
): SvgEntity | null {
  const d = node.attributes?.d
  if (typeof d !== "string" || d.trim().length === 0) {
    return unsupported("path", "path-malformed")
  }

  let normalised: ReturnType<typeof svgpath>
  try {
    normalised = svgpath(d)
    if (composedTransform.trim().length > 0) {
      normalised = normalised.transform(composedTransform)
    }
    if (userUnitScale !== 1) {
      normalised = normalised.scale(userUnitScale, userUnitScale)
    }
    // Y-flip into math-coords (Y up). Applied after every ancestor
    // transform so the parser output matches DXF's coordinate convention.
    normalised = normalised.matrix([1, 0, 0, -1, 0, 0])
    normalised = normalised.unarc().unshort().abs()
  } catch (_error) {
    return unsupported("path", "path-malformed")
  }

  const state = newPathBuilderState()
  normalised.iterate((segment) => handlePathSegment(segment, state))
  finalisePathBuilder(state)

  if (state.loops.length === 0) {
    return unsupported("path", "open-path-no-z")
  }
  return { kind: "path", loops: state.loops }
}

function parseRect(
  node: INode,
  composedTransform: string,
  userUnitScale: number
): SvgEntity | null {
  const x = numericAttr(node, "x", 0)
  const y = numericAttr(node, "y", 0)
  const width = numericAttr(node, "width", 0)
  const height = numericAttr(node, "height", 0)
  if (width <= 0 || height <= 0) return null
  // Per SVG spec, when one of rx/ry is omitted it defaults to the other —
  // in both directions. Read both raw, then cross-default.
  const rxRaw = Math.max(0, numericAttr(node, "rx", 0))
  const ryRaw = Math.max(0, numericAttr(node, "ry", 0))
  const rx = rxRaw === 0 ? ryRaw : rxRaw
  const ry = ryRaw === 0 ? rxRaw : ryRaw

  if (rx === 0 && ry === 0) {
    const corners: Point2D[] = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ]
    return { kind: "rect", loop: applyTransformToPoints(corners, composedTransform, userUnitScale) }
  }

  // Rounded rect: 4 axis-aligned edges + 4 quadratic-approximated arcs.
  // We use the standard tessellator on each corner ellipse for fidelity.
  const erx = Math.min(rx, width / 2)
  const ery = Math.min(ry, height / 2)
  const corners: Point2D[] = []
  // Top edge (left-to-right after top-left arc).
  pushArcCorner(corners, x + erx, y + ery, erx, ery, Math.PI, 1.5 * Math.PI)
  corners.push({ x: x + width - erx, y })
  pushArcCorner(corners, x + width - erx, y + ery, erx, ery, 1.5 * Math.PI, 2 * Math.PI)
  corners.push({ x: x + width, y: y + height - ery })
  pushArcCorner(corners, x + width - erx, y + height - ery, erx, ery, 0, 0.5 * Math.PI)
  corners.push({ x: x + erx, y: y + height })
  pushArcCorner(corners, x + erx, y + height - ery, erx, ery, 0.5 * Math.PI, Math.PI)

  return { kind: "rect", loop: applyTransformToPoints(corners, composedTransform, userUnitScale) }
}

function pushArcCorner(
  out: Point2D[],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  startParam: number,
  endParam: number
): void {
  const verts = tessellateEllipse({
    center: { x: cx, y: cy },
    majorAxisEnd: { x: rx, y: 0 },
    axisRatio: rx === 0 ? 0 : ry / rx,
    startParam,
    endParam,
  })
  for (const v of verts) out.push(v)
}

function parseCircle(
  node: INode,
  composedTransform: string,
  userUnitScale: number
): SvgEntity | null {
  const cx = numericAttr(node, "cx", 0)
  const cy = numericAttr(node, "cy", 0)
  const r = numericAttr(node, "r", 0)
  if (r <= 0) return null
  const verts = tessellateCircle({ x: cx, y: cy }, r)
  return {
    kind: "circle",
    loop: applyTransformToPoints(verts, composedTransform, userUnitScale),
  }
}

function parseEllipse(
  node: INode,
  composedTransform: string,
  userUnitScale: number
): SvgEntity | null {
  const cx = numericAttr(node, "cx", 0)
  const cy = numericAttr(node, "cy", 0)
  const rx = numericAttr(node, "rx", 0)
  const ry = numericAttr(node, "ry", 0)
  if (rx <= 0 || ry <= 0) return null
  const verts = tessellateEllipse({
    center: { x: cx, y: cy },
    majorAxisEnd: { x: rx, y: 0 },
    axisRatio: ry / rx,
    startParam: 0,
    endParam: 2 * Math.PI,
  })
  return {
    kind: "ellipse",
    loop: applyTransformToPoints(verts, composedTransform, userUnitScale),
  }
}

function parsePolygon(
  node: INode,
  composedTransform: string,
  userUnitScale: number
): SvgEntity | null {
  const points = parsePointsAttr(node.attributes?.points)
  if (points.length < 3) return null
  return {
    kind: "polygon",
    loop: applyTransformToPoints(points, composedTransform, userUnitScale),
  }
}

function parsePolyline(
  node: INode,
  composedTransform: string,
  userUnitScale: number
): SvgEntity | null {
  const points = parsePointsAttr(node.attributes?.points)
  if (points.length < 3) {
    return unsupported("polyline", "polyline-not-closeable")
  }
  const transformed = applyTransformToPoints(points, composedTransform, userUnitScale)
  const first = transformed[0]
  const last = transformed[transformed.length - 1]
  if (!sameWithin(first, last, POLYLINE_CLOSE_TOLERANCE)) {
    return unsupported("polyline", "polyline-not-closeable")
  }
  return { kind: "polyline", loop: transformed.slice(0, -1) }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function numericAttr(node: INode, name: string, fallback: number): number {
  const raw = node.attributes?.[name]
  if (raw === undefined) return fallback
  const value = parseFloat(raw)
  return Number.isFinite(value) ? value : fallback
}

function parsePointsAttr(raw: string | undefined): Point2D[] {
  if (raw === undefined) return []
  const tokens = raw
    .trim()
    .split(/[\s,]+/)
    .map((tok) => parseFloat(tok))
    .filter((n) => Number.isFinite(n))
  const pts: Point2D[] = []
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    pts.push({ x: tokens[i], y: tokens[i + 1] })
  }
  return pts
}

function applyTransformToPoints(
  points: Point2D[],
  composedTransform: string,
  userUnitScale: number
): Point2D[] {
  if (points.length === 0) return points
  // Round-trip through svgpath's matrix engine for transform correctness.
  // We construct a tiny synthetic path, transform, then read back.
  const synthetic = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")
  let chain = svgpath(synthetic)
  if (composedTransform.trim().length > 0) {
    chain = chain.transform(composedTransform)
  }
  if (userUnitScale !== 1) {
    chain = chain.scale(userUnitScale, userUnitScale)
  }
  // Y-flip into math-coords (Y up) — see parseSvg file header.
  chain = chain.matrix([1, 0, 0, -1, 0, 0]).abs()

  const out: Point2D[] = []
  chain.iterate((segment) => {
    const cmd = segment[0]
    if (cmd === "M" || cmd === "L") {
      out.push({ x: segment[1] as number, y: segment[2] as number })
    }
  })
  return out
}

function sameWithin(a: Point2D, b: Point2D, tol: number): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol
}

function unsupported(originalType: string, reason: UnsupportedSvgReason): UnsupportedSvgEntity {
  return { kind: "unsupported", originalType, reason }
}
