import ClipperLib from "clipper-lib"
import type { Point2D } from "@/nesting/types"
import { circleToPolygon, rectToPolygon } from "@/nesting/shape-to-polygon"
import { polygonArea } from "@/nesting/convex-hull"
import type { PartTemplate } from "./PresetDimensionSelector"
import type { StockConfig } from "./stock-preview-configurator"
import type { LayoutRegion } from "./layout-model"
import type { ManualPlacement } from "./free-roam-collision"

/**
 * Sheet-space polygon for a single placement. Rectangles expand to 4
 * rotated corners, discs to a 24-vertex approximation. Unknown /
 * missing templates collapse to an empty array so the caller can
 * skip them without a try/catch.
 *
 * The vertices are in SHEET INCH coords (post-rotation), matching the
 * format `extractMaximalFreeRects` expects.
 */
function placementToSheetPolygon(placement: ManualPlacement, template: PartTemplate): Point2D[] {
  const width = template.width ?? template.diameter ?? 12
  const height = template.length ?? template.height ?? template.diameter ?? 12
  const cx = placement.x + width / 2
  const cy = placement.y + height / 2
  const cos = Math.cos(placement.rotationRad)
  const sin = Math.sin(placement.rotationRad)

  const rotateAndTranslate = (local: Point2D[]): Point2D[] =>
    local.map((p) => {
      const dx = p.x - width / 2
      const dy = p.y - height / 2
      return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
    })

  // Shape-registry templates carry a pre-built local polygon —
  // triangle, ellipse, n-gon, star, ring, custom. Use it directly
  // so the waste math hugs the actual shape instead of a rect.
  if (template.polygon && template.polygon.length >= 3) {
    return rotateAndTranslate(template.polygon)
  }

  if (template.partType === "cylinder" && template.diameter) {
    return rotateAndTranslate(circleToPolygon(template.diameter, 24))
  }

  return rotateAndTranslate(rectToPolygon(width, height))
}

/** All placements converted to sheet-space polygons. Missing templates skipped. */
export function placementsToPolygons(
  placements: ManualPlacement[],
  parts: PartTemplate[]
): Point2D[][] {
  const byId = new Map(parts.map((p) => [p.id, p]))
  const polys: Point2D[][] = []
  for (const placement of placements) {
    const template = byId.get(placement.templateId)
    if (!template) continue
    const poly = placementToSheetPolygon(placement, template)
    if (poly.length >= 3) polys.push(poly)
  }
  return polys
}

export interface ComputedRegions {
  offcuts: LayoutRegion[]
  scrap: LayoutRegion[]
}

/**
 * Visual / metric floor for scrap polygons. Anything smaller than
 * this falls back to the ambient amber background and doesn't count
 * as waste — operators can't cut a 1.4"×1.4" sliver, so showing it
 * as red reads as noise rather than information.
 */
const MIN_VISIBLE_SCRAP_SQIN = 2

// ── Clipper helpers for the "unreusable residue" compute ─────────────────

const CLIPPER_SCALE = 1e7

type ClipperPoint = { X: number; Y: number }
type ClipperPath = ClipperPoint[]

function toClipperPath(points: ReadonlyArray<Point2D>): ClipperPath {
  return points.map((p) => ({
    X: Math.round(p.x * CLIPPER_SCALE),
    Y: Math.round(p.y * CLIPPER_SCALE),
  }))
}

function fromClipperPath(path: ReadonlyArray<ClipperPoint>): Point2D[] {
  return path.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }))
}

function polyBbox(poly: Point2D[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of poly) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Compute per-placement "shape-envelope waste" polygons — the material
 * trapped between a part's TEMPLATE-LOCAL axis-aligned envelope and the
 * part's actual outline. For rectangles this is empty (envelope ≡ shape).
 * For discs the result is the four corner crescents. For trapezoids /
 * triangles / sectors it's the tapered slivers along the envelope edges.
 *
 * Computed in LOCAL coords (where the envelope is always axis-aligned)
 * and then rotated/translated to sheet space. Doing the difference in
 * sheet space against the SHEET-AABB would over-estimate waste for
 * rotated rectangles — a 24"×12" rect at 30° has a sheet-AABB roughly
 * 23"×22", and `bbox − rect` produces large phantom corner triangles
 * even though the rectangle has no real shape-envelope waste at all.
 *
 * Issue #116 root-cause story: the old implementation also unioned this
 * with thin-strip "waste" extracted via `extractMaximalFreeRects`, which
 * emitted topology-dependent open-edge slivers (a strip alongside a
 * part with the other side facing unused stock). Those slivers aren't
 * waste — operators can rearrange to reclaim them — and the greedy
 * carve order made them appear to "move around" when shapes were added
 * elsewhere on the canvas. We now ONLY classify shape-envelope waste:
 * material trapped by the part's own geometry, which is invariant to
 * surrounding placements and can never be reclaimed without changing
 * the part itself.
 */
function computeShapeEnvelopeWaste(
  placements: ReadonlyArray<ManualPlacement>,
  parts: ReadonlyArray<PartTemplate>
): Point2D[][] {
  const byId = new Map(parts.map((p) => [p.id, p]))
  const out: Point2D[][] = []

  for (const placement of placements) {
    const template = byId.get(placement.templateId)
    if (!template) continue

    const width = template.width ?? template.diameter ?? 12
    const height = template.length ?? template.height ?? template.diameter ?? 12
    if (width <= 0 || height <= 0) continue

    // Resolve the local-coords shape outline. Rectangles return early —
    // their envelope IS the shape, so the difference is empty.
    let localShape: Point2D[]
    if (template.polygon && template.polygon.length >= 3) {
      localShape = template.polygon
    } else if (template.partType === "cylinder" && template.diameter) {
      localShape = circleToPolygon(template.diameter, 24)
    } else {
      continue
    }

    const localEnvelope: Point2D[] = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ]

    const clip = new ClipperLib.Clipper()
    clip.AddPath(toClipperPath(localEnvelope), ClipperLib.PolyType.ptSubject, true)
    clip.AddPath(toClipperPath(localShape), ClipperLib.PolyType.ptClip, true)
    const paths = new ClipperLib.Paths()
    clip.Execute(
      ClipperLib.ClipType.ctDifference,
      paths,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero
    )

    if (paths.length === 0) continue

    // Transform the local-coord residue polygons into sheet space using
    // the same pivot-around-center rotation the canvas applies.
    const cx = placement.x + width / 2
    const cy = placement.y + height / 2
    const cos = Math.cos(placement.rotationRad)
    const sin = Math.sin(placement.rotationRad)
    for (const path of paths) {
      if (ClipperLib.Clipper.Area(path) <= 0) continue
      const localPoly = fromClipperPath(path)
      const sheetPoly = localPoly.map((p) => {
        const dx = p.x - width / 2
        const dy = p.y - height / 2
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
      })
      out.push(sheetPoly)
    }
  }

  return out
}

/**
 * Union all waste inputs via Clipper so overlapping signals (crescent
 * + thin-strip) render as a single layer instead of compounding into
 * darker patches where they overlap. Each 28%-alpha rect stacked on
 * another 28%-alpha rect would read as a noticeably darker red; the
 * user reads that as "different shades of scrap" which isn't what
 * the classifier means.
 *
 * Returns the disjoint outer contours of the merged waste polygon
 * set — ready to hand to the renderer as individual `LayoutRegion`s.
 */
function unionWasteRegions(
  crescentPolys: ReadonlyArray<ReadonlyArray<Point2D>>,
  thinRects: ReadonlyArray<{ x: number; y: number; width: number; height: number }>
): Point2D[][] {
  if (crescentPolys.length === 0 && thinRects.length === 0) return []

  const clip = new ClipperLib.Clipper()
  let added = 0
  for (const poly of crescentPolys) {
    if (poly.length < 3) continue
    clip.AddPath(toClipperPath(poly), ClipperLib.PolyType.ptSubject, true)
    added++
  }
  for (const r of thinRects) {
    clip.AddPath(
      toClipperPath([
        { x: r.x, y: r.y },
        { x: r.x + r.width, y: r.y },
        { x: r.x + r.width, y: r.y + r.height },
        { x: r.x, y: r.y + r.height },
      ]),
      ClipperLib.PolyType.ptSubject,
      true
    )
    added++
  }
  if (added === 0) return []

  const out = new ClipperLib.Paths()
  clip.Execute(
    ClipperLib.ClipType.ctUnion,
    out,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  )
  const polys: Point2D[][] = []
  for (const path of out) {
    if (ClipperLib.Clipper.Area(path) <= 0) continue // skip holes
    polys.push(fromClipperPath(path))
  }
  return polys
}

/**
 * Trapped-pocket waste: free-space components in `stock − ⋃parts` that
 * don't touch the stock boundary. These are pockets fully enclosed by
 * placed parts — material the operator can't recover by sliding things
 * around (they'd have to remove a surrounding part).
 *
 * Algorithm (Clipper PolyTree decomposition):
 *
 *   1. Union all part polygons so touching/overlapping parts collapse
 *      into one composite footprint. Without this, the difference can
 *      produce self-touching contours that hide a real pocket.
 *   2. Compute `stock − part_union` as a `PolyTree`. The tree alternates
 *      hole / outer levels: root is a hole, its children are outer
 *      free-space contours, their children are hole contours (placed
 *      parts), etc.
 *   3. DFS over all NON-hole nodes at any depth. Each one is a free-
 *      space component. Pockets enclosed by parts appear NESTED several
 *      levels deep (root → free-space outer → part hole → POCKET) —
 *      iterating only top-level nodes misses them.
 *   4. Drop any component with a vertex within ε of the stock boundary —
 *      that component has a frontier and is reclaimable, not a pocket.
 *
 * Performance: two Clipper passes (union + difference) per drag tick.
 * Sub-millisecond for typical ~10-part scenes per upstream benchmarks.
 *
 * Refs: clipper-lib `Execute(...)` overload for `PolyTree`
 * (https://sourceforge.net/p/jsclipper/wiki/documentation/), jagua-rs
 * leftover classification (https://github.com/JeroenGar/jagua-rs).
 */
const STOCK_BOUNDARY_EPS_IN = 1e-3

function computeTrappedPocketWaste(
  placements: ReadonlyArray<ManualPlacement>,
  parts: ReadonlyArray<PartTemplate>,
  stock: StockConfig
): Point2D[][] {
  if (placements.length === 0 || stock.width <= 0 || stock.length <= 0) return []

  const partPaths: ClipperPath[] = []
  for (const placement of placements) {
    const template = parts.find((p) => p.id === placement.templateId)
    if (!template) continue
    const poly = placementsToPolygons([placement], [template])[0]
    if (poly && poly.length >= 3) partPaths.push(toClipperPath(poly))
  }
  if (partPaths.length === 0) return []

  // Pre-union parts so touching edges don't produce self-touching diff
  // contours that would hide a real surrounded pocket.
  const unionClip = new ClipperLib.Clipper()
  unionClip.AddPaths(partPaths, ClipperLib.PolyType.ptSubject, true)
  const partUnion = new ClipperLib.Paths()
  unionClip.Execute(
    ClipperLib.ClipType.ctUnion,
    partUnion,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  )
  if (partUnion.length === 0) return []

  const stockPath = toClipperPath([
    { x: 0, y: 0 },
    { x: stock.width, y: 0 },
    { x: stock.width, y: stock.length },
    { x: 0, y: stock.length },
  ])
  const diff = new ClipperLib.Clipper()
  diff.AddPath(stockPath, ClipperLib.PolyType.ptSubject, true)
  diff.AddPaths(partUnion, ClipperLib.PolyType.ptClip, true)

  const tree = new ClipperLib.PolyTree()
  diff.Execute(
    ClipperLib.ClipType.ctDifference,
    tree,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  )

  const stockW = Math.round(stock.width * CLIPPER_SCALE)
  const stockL = Math.round(stock.length * CLIPPER_SCALE)
  const eps = Math.ceil(STOCK_BOUNDARY_EPS_IN * CLIPPER_SCALE)

  const touchesBoundary = (path: ClipperPath): boolean =>
    path.some(
      (p) =>
        Math.abs(p.X) <= eps ||
        Math.abs(p.X - stockW) <= eps ||
        Math.abs(p.Y) <= eps ||
        Math.abs(p.Y - stockL) <= eps
    )

  const pockets: Point2D[][] = []
  const visit = (node: ClipperLib.PolyNode): void => {
    const contour = node.Contour()
    if (
      !node.IsOpen &&
      !node.IsHole() &&
      contour.length >= 3 &&
      ClipperLib.Clipper.Area(contour) > 0 &&
      !touchesBoundary(contour)
    ) {
      pockets.push(fromClipperPath(contour))
    }
    for (const child of node.Childs()) visit(child)
  }
  for (const child of tree.Childs()) visit(child)

  return pockets
}

/**
 * Continuously-computed amber/red regions for the Free-roam canvas.
 *
 * Two waste signals, OR-unioned:
 *
 *   1. **Shape-envelope waste** — material trapped between each part's
 *      template-local axis-aligned envelope and its actual outline.
 *      Discs produce corner crescents, trapezoids produce tapered
 *      slivers, rectangles produce nothing (envelope ≡ shape).
 *      Invariant under part arrangement.
 *
 *   2. **Trapped-pocket waste** — free-space components in `stock − ⋃parts`
 *      that don't touch the stock boundary. A 12"×12" hole fully
 *      enclosed by four surrounding parts is a real pocket the operator
 *      can't reclaim without moving a surrounding part. Components that
 *      reach the stock boundary are "open frontier" — unused stock the
 *      operator can plan around — and stay ambient.
 *
 * The earlier implementation used `extractMaximalFreeRects` greedy
 * thin-strip detection, which was topology-dependent: adding an
 * unrelated shape elsewhere shuffled the extraction order and made
 * waste appear to "move around" the canvas (issue #116). The new
 * pocket-detection signal replaces it with a deterministic topological
 * predicate that matches operator intuition.
 *
 * Cheap enough to run on every rAF tick: one Clipper diff per placement
 * for envelopes, plus one union + one difference + one DFS for pockets.
 */
export function computeAdaptiveRegions(
  placements: ManualPlacement[],
  parts: PartTemplate[],
  stock: StockConfig
): ComputedRegions {
  if (placements.length === 0 || stock.width <= 0 || stock.length <= 0) {
    return { offcuts: [], scrap: [] }
  }

  const envelopeWaste = computeShapeEnvelopeWaste(placements, parts)
  const pocketWaste = computeTrappedPocketWaste(placements, parts, stock)

  // Union both signals via Clipper so overlapping waste (e.g. a corner
  // crescent that abuts a pocket) renders as one uniformly-coloured
  // region instead of compounding into darker patches where they overlap.
  const merged = unionWasteRegions([...envelopeWaste, ...pocketWaste], [])
  const scrap: LayoutRegion[] = []
  for (const poly of merged) {
    if (polygonArea(poly) < MIN_VISIBLE_SCRAP_SQIN) continue
    const bbox = polyBbox(poly)
    scrap.push({ ...bbox, polygon: poly })
  }

  // Stable order so re-renders (and React keys) don't flicker as
  // upstream Clipper output happens to permute polygons. Sort by
  // (y, x, width, height) — top-to-bottom, then left-to-right.
  scrap.sort((a, b) => a.y - b.y || a.x - b.x || a.width - b.width || a.height - b.height)

  // Offcuts deliberately empty — the amber sheet background already
  // paints the reusable semantic.
  return { offcuts: [], scrap }
}
