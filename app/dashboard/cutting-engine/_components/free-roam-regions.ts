import ClipperLib from "clipper-lib"
import type { Point2D } from "@/nesting/types"
import { circleToPolygon, rectToPolygon } from "@/nesting/shape-to-polygon"
import { polygonArea } from "@/nesting/convex-hull"
import type { PartTemplate } from "./PresetDimensionSelector"
import type { StockConfig } from "./stock-preview-configurator"
import type { LayoutRegion } from "./layout-model"
import type { ManualPlacement } from "./free-roam-collision"
import { syncRegionCache, type RegionCache } from "./free-roam-region-cache"

/**
 * Module-level frozen empty `LayoutRegion[]` used everywhere
 * `finalizeRegions` / `computeAdaptiveRegions` would otherwise return
 * a fresh `[]`. Keeping the reference stable lets downstream memos
 * (`useFreeRoamLayout`, `KonvaSheetRenderer`) bail out via `===`
 * across drag ticks when the region set is empty (the common case
 * for `offcuts` in Free-roam — see `finalizeRegions` rationale).
 */
const EMPTY_LAYOUT_REGIONS: readonly LayoutRegion[] = Object.freeze([])

/**
 * Sheet-space polygon for a single placement. Rectangles expand to 4
 * rotated corners, discs to a 24-vertex approximation. Unknown /
 * missing templates collapse to an empty array so the caller can
 * skip them without a try/catch.
 *
 * The vertices are in SHEET INCH coords (post-rotation), matching the
 * format `extractMaximalFreeRects` expects.
 */
export function placementToSheetPolygon(
  placement: ManualPlacement,
  template: PartTemplate
): Point2D[] {
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
  offcuts: readonly LayoutRegion[]
  scrap: readonly LayoutRegion[]
}

/**
 * Visual / metric floor for scrap polygons. Anything smaller than
 * this falls back to the ambient amber background and doesn't count
 * as waste — operators can't cut a 1.4"×1.4" sliver, so showing it
 * as red reads as noise rather than information.
 */
const MIN_VISIBLE_SCRAP_SQIN = 2

/**
 * Per-side gap threshold (inches). When a placed part has less than
 * this distance between one of its sides and the nearest obstacle
 * (stock edge or another placed part on that side), the gap renders
 * as red waste. Above this threshold, the gap is wide enough that the
 * operator could plan another part into it, so it stays ambient.
 *
 * Tuned to 4" — the smallest gap an operator typically considers
 * usable. Anything narrower reads as a sliver they can't realistically
 * cut another piece from, even though it doesn't quite hit the 6"
 * Auto-nest reusable-strip threshold.
 */
const MIN_USABLE_GAP_IN = 4

// ── Clipper helpers for the "unreusable residue" compute ─────────────────

const CLIPPER_SCALE = 1e7

export type ClipperPoint = { X: number; Y: number }
export type ClipperPath = ClipperPoint[]

export function toClipperPath(points: ReadonlyArray<Point2D>): ClipperPath {
  return points.map((p) => ({
    X: Math.round(p.x * CLIPPER_SCALE),
    Y: Math.round(p.y * CLIPPER_SCALE),
  }))
}

function fromClipperPath(path: ReadonlyArray<ClipperPoint>): Point2D[] {
  return path.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }))
}

export function polyBbox(poly: Point2D[]): { x: number; y: number; width: number; height: number } {
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
/**
 * Per-placement envelope-waste computation. Pulled out so the cache layer
 * can memoize the result — for a placement whose geometry hasn't changed
 * across drag ticks, the diff result is identical and can be reused
 * without re-entering Clipper.
 */
export function computeEnvelopeWasteForPlacement(
  placement: ManualPlacement,
  template: PartTemplate
): Point2D[][] {
  const width = template.width ?? template.diameter ?? 12
  const height = template.length ?? template.height ?? template.diameter ?? 12
  if (width <= 0 || height <= 0) return []

  // Resolve the local-coords shape outline. Rectangles return early —
  // their envelope IS the shape, so the difference is empty.
  let localShape: Point2D[]
  if (template.polygon && template.polygon.length >= 3) {
    localShape = template.polygon
  } else if (template.partType === "cylinder" && template.diameter) {
    localShape = circleToPolygon(template.diameter, 24)
  } else {
    return []
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

  if (paths.length === 0) return []

  // Transform the local-coord residue polygons into sheet space using
  // the same pivot-around-center rotation the canvas applies.
  const cx = placement.x + width / 2
  const cy = placement.y + height / 2
  const cos = Math.cos(placement.rotationRad)
  const sin = Math.sin(placement.rotationRad)
  const out: Point2D[][] = []
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
  return out
}

function computeShapeEnvelopeWaste(
  placements: ReadonlyArray<ManualPlacement>,
  parts: ReadonlyArray<PartTemplate>
): Point2D[][] {
  const byId = new Map(parts.map((p) => [p.id, p]))
  const out: Point2D[][] = []
  for (const placement of placements) {
    const template = byId.get(placement.templateId)
    if (!template) continue
    out.push(...computeEnvelopeWasteForPlacement(placement, template))
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

/**
 * Trapped-pocket pass driven by pre-built Clipper paths. Pulled out so
 * the cache layer can hand in already-encoded paths instead of
 * re-running `toClipperPath` on every drag tick.
 */
export function computeTrappedPocketWasteFromPaths(
  partPaths: ReadonlyArray<ClipperPath>,
  stock: StockConfig
): Point2D[][] {
  if (partPaths.length === 0 || stock.width <= 0 || stock.length <= 0) return []

  // Pre-union parts so touching edges don't produce self-touching diff
  // contours that would hide a real surrounded pocket.
  const unionClip = new ClipperLib.Clipper()
  unionClip.AddPaths(partPaths.slice(), ClipperLib.PolyType.ptSubject, true)
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

  const isTouchingBoundary = (path: ClipperPath): boolean =>
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
      !isTouchingBoundary(contour)
    ) {
      pockets.push(fromClipperPath(contour))
    }
    for (const child of node.Childs()) visit(child)
  }
  for (const child of tree.Childs()) visit(child)

  return pockets
}

function computeTrappedPocketWaste(
  placements: ReadonlyArray<ManualPlacement>,
  parts: ReadonlyArray<PartTemplate>,
  stock: StockConfig
): Point2D[][] {
  if (placements.length === 0 || stock.width <= 0 || stock.length <= 0) return []
  const byId = new Map(parts.map((p) => [p.id, p]))
  const partPaths: ClipperPath[] = []
  for (const placement of placements) {
    const template = byId.get(placement.templateId)
    if (!template) continue
    const poly = placementToSheetPolygon(placement, template)
    if (poly.length >= 3) partPaths.push(toClipperPath(poly))
  }
  return computeTrappedPocketWasteFromPaths(partPaths, stock)
}

/**
 * Per-side gap waste: for each placed part, on each of its 4 sides,
 * find the perpendicular distance to the nearest blocker (stock edge
 * or another placed part whose bbox shadows the side). If the gap is
 * non-zero and below `MIN_USABLE_GAP_IN`, emit it as a thin waste
 * rectangle aligned to that side.
 *
 * Per-part, per-side computation is deterministic — the gap on
 * placement P's top side depends only on P's position and the parts
 * directly above P (in P's x-range). Adding a part elsewhere on the
 * canvas can never change P's existing gaps. This is the property the
 * old `extractMaximalFreeRects`-based detector was missing (its greedy
 * decomposition order was topology-sensitive).
 *
 * Output bboxes only — these are always axis-aligned strips, so a full
 * polygon adds no information over `LayoutRegion.{x,y,width,height}`.
 */
export type SideGapBbox = { x: number; y: number; width: number; height: number }
type SideGap = { gap: number; blocker: number; isVisible: boolean }

const GAP_EPSILON = 1e-3

function rectAsPoly(x: number, y: number, w: number, h: number): Point2D[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

function isVisibleGap(gap: number): boolean {
  return gap > GAP_EPSILON && gap < MIN_USABLE_GAP_IN
}

function gapAbove(meIdx: number, all: ReadonlyArray<SideGapBbox>): SideGap {
  const me = all[meIdx]
  let blocker = 0
  for (let i = 0; i < all.length; i++) {
    if (i === meIdx) continue
    const o = all[i]
    if (o.x + o.width <= me.x + GAP_EPSILON || o.x >= me.x + me.width - GAP_EPSILON) continue
    const oBottom = o.y + o.height
    if (oBottom <= me.y + GAP_EPSILON && oBottom > blocker) blocker = oBottom
  }
  const gap = me.y - blocker
  return { gap, blocker, isVisible: isVisibleGap(gap) }
}

function gapBelow(meIdx: number, all: ReadonlyArray<SideGapBbox>, stockLength: number): SideGap {
  const me = all[meIdx]
  let blocker = stockLength
  const myBottom = me.y + me.height
  for (let i = 0; i < all.length; i++) {
    if (i === meIdx) continue
    const o = all[i]
    if (o.x + o.width <= me.x + GAP_EPSILON || o.x >= me.x + me.width - GAP_EPSILON) continue
    if (o.y >= myBottom - GAP_EPSILON && o.y < blocker) blocker = o.y
  }
  const gap = blocker - myBottom
  return { gap, blocker, isVisible: isVisibleGap(gap) }
}

function gapLeft(meIdx: number, all: ReadonlyArray<SideGapBbox>): SideGap {
  const me = all[meIdx]
  let blocker = 0
  const myBottom = me.y + me.height
  for (let i = 0; i < all.length; i++) {
    if (i === meIdx) continue
    const o = all[i]
    if (o.y + o.height <= me.y + GAP_EPSILON || o.y >= myBottom - GAP_EPSILON) continue
    const oRight = o.x + o.width
    if (oRight <= me.x + GAP_EPSILON && oRight > blocker) blocker = oRight
  }
  const gap = me.x - blocker
  return { gap, blocker, isVisible: isVisibleGap(gap) }
}

function gapRight(meIdx: number, all: ReadonlyArray<SideGapBbox>, stockWidth: number): SideGap {
  const me = all[meIdx]
  let blocker = stockWidth
  const myRight = me.x + me.width
  const myBottom = me.y + me.height
  for (let i = 0; i < all.length; i++) {
    if (i === meIdx) continue
    const o = all[i]
    if (o.y + o.height <= me.y + GAP_EPSILON || o.y >= myBottom - GAP_EPSILON) continue
    if (o.x >= myRight - GAP_EPSILON && o.x < blocker) blocker = o.x
  }
  const gap = blocker - myRight
  return { gap, blocker, isVisible: isVisibleGap(gap) }
}

/**
 * Build the side-strip + corner-fill rectangles for one placement. When two
 * adjacent sides both have visible gaps (e.g. top + left for a part wedged
 * into the upper-left of the sheet), the small square between their outer
 * extents would otherwise be left unpainted — visually reading as a "hole"
 * in the L-shape of red. Emitting the corner rectangle fills it in so the
 * union renders as a clean L (or full rectangle when all 4 sides have gaps).
 */
function buildGapPolysForPart(
  me: SideGapBbox,
  top: SideGap,
  bot: SideGap,
  lft: SideGap,
  rgt: SideGap
): Point2D[][] {
  const out: Point2D[][] = []
  const myRight = me.x + me.width
  const myBottom = me.y + me.height

  if (top.isVisible) out.push(rectAsPoly(me.x, top.blocker, me.width, top.gap))
  if (bot.isVisible) out.push(rectAsPoly(me.x, myBottom, me.width, bot.gap))
  if (lft.isVisible) out.push(rectAsPoly(lft.blocker, me.y, lft.gap, me.height))
  if (rgt.isVisible) out.push(rectAsPoly(myRight, me.y, rgt.gap, me.height))

  // Corner fills — connect adjacent visible side strips.
  if (top.isVisible && lft.isVisible) {
    out.push(rectAsPoly(lft.blocker, top.blocker, lft.gap, top.gap))
  }
  if (top.isVisible && rgt.isVisible) {
    out.push(rectAsPoly(myRight, top.blocker, rgt.gap, top.gap))
  }
  if (bot.isVisible && lft.isVisible) {
    out.push(rectAsPoly(lft.blocker, myBottom, lft.gap, bot.gap))
  }
  if (bot.isVisible && rgt.isVisible) {
    out.push(rectAsPoly(myRight, myBottom, rgt.gap, bot.gap))
  }

  return out
}

/**
 * Per-side gap pass driven by pre-built bboxes. Pulled out so the cache
 * layer can hand in already-computed bboxes. Indexed inner loop avoids
 * the O(n²) array allocation that `bboxes.filter((_, j) => j !== i)`
 * triggered every drag tick.
 *
 * Note: must always recompute ALL bboxes' gaps — moving one placement
 * can change another's nearest-blocker on a side that "shadows" it.
 * Per-bbox memoization is unsafe.
 */
export function computePerSideGapWasteFromBboxes(
  bboxes: ReadonlyArray<SideGapBbox>,
  stock: StockConfig
): Point2D[][] {
  if (bboxes.length === 0 || stock.width <= 0 || stock.length <= 0) return []

  const out: Point2D[][] = []
  for (let i = 0; i < bboxes.length; i++) {
    const me = bboxes[i]
    const top = gapAbove(i, bboxes)
    const bot = gapBelow(i, bboxes, stock.length)
    const lft = gapLeft(i, bboxes)
    const rgt = gapRight(i, bboxes, stock.width)
    out.push(...buildGapPolysForPart(me, top, bot, lft, rgt))
  }
  return out
}

function computePerSideGapWaste(
  placements: ReadonlyArray<ManualPlacement>,
  parts: ReadonlyArray<PartTemplate>,
  stock: StockConfig
): Point2D[][] {
  if (placements.length === 0 || stock.width <= 0 || stock.length <= 0) return []
  const byId = new Map(parts.map((p) => [p.id, p]))
  const bboxes: SideGapBbox[] = []
  for (const placement of placements) {
    const template = byId.get(placement.templateId)
    if (!template) continue
    const poly = placementToSheetPolygon(placement, template)
    if (poly.length < 3) continue
    bboxes.push(polyBbox(poly))
  }
  return computePerSideGapWasteFromBboxes(bboxes, stock)
}

/**
 * Finalize a merged waste polygon list into the LayoutRegion shape the
 * canvas + metrics expect. Filter sub-visible scrap, attach bboxes, and
 * stable-sort so re-renders don't flicker. Shared between cached and
 * uncached paths so both produce byte-identical output.
 */
function finalizeRegions(merged: ReadonlyArray<Point2D[]>): ComputedRegions {
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
  // paints the reusable semantic. Reuse the module-level frozen empty
  // array so downstream `===` identity checks across drag ticks see
  // the same reference and skip reconciliation.
  return { offcuts: EMPTY_LAYOUT_REGIONS, scrap }
}

export interface ComputeAdaptiveRegionsOptions {
  /**
   * Skip the trapped-pocket pass. Pockets are detected via Clipper Union
   * of all parts followed by Difference against stock — the dominant
   * per-tick cost for many placements. Pockets only form when parts
   * fully enclose free space (rare during a single-part drag), so the
   * caller can defer this pass to drop and recompute it from the
   * committed positions. The other two passes (envelope + side-gap)
   * remain accurate for live drag feedback.
   */
  skipPocketPass?: boolean
  /**
   * Dev-only: when true, record per-stage timing in a module-local
   * sink readable via `__dumpRegionTimings()`. Production builds
   * strip this branch via `process.env.NODE_ENV` DCE; pass
   * `enableTimings: true` only from a dev-mode caller.
   */
  enableTimings?: boolean
}

export interface RegionComputeSample {
  syncMs: number
  envelopeMs: number
  pocketMs: number
  gapMs: number
  unionMs: number
  totalMs: number
  placementCount: number
  skipPocket: boolean
}

const __regionTimingSink: RegionComputeSample[] = []

/**
 * Dev-only: drain the per-stage timing samples collected since the last
 * call. Empty in production builds — the sample-recording branch is
 * gated on `process.env.NODE_ENV !== "production"` so DCE strips it.
 */
export function __dumpRegionTimings(): RegionComputeSample[] {
  return __regionTimingSink.splice(0, __regionTimingSink.length)
}

/**
 * Continuously-computed amber/red regions for the Free-roam canvas.
 *
 * Three waste signals, OR-unioned:
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
 *   3. **Per-side gap waste** — for each placed part, on each of its 4
 *      sides, the perpendicular distance to the nearest blocker (stock
 *      edge or another part shadowing the side). Below `MIN_USABLE_GAP_IN`
 *      = 4", that gap renders red. Per-bbox computation is recomputed
 *      every tick (moving one part can change another's nearest blocker
 *      on a shadowing side, so per-bbox memoization is unsafe).
 *
 * Pass an optional `RegionCache` to skip per-placement work for
 * placements whose geometry hasn't changed since the previous call —
 * the typical drag scenario. Without a cache, behavior is byte-identical
 * to the un-cached path; with a cache, output is byte-identical to the
 * un-cached path for the same inputs (verified by the equivalence test
 * suite in `tests/cutting-engine/issue-117-region-cache.test.ts`).
 *
 * Pass `options.skipPocketPass` to skip pocket detection (the heaviest
 * pass). Used during live drag — pockets are recomputed on drop from
 * the committed placements path.
 */
export function computeAdaptiveRegions(
  placements: ManualPlacement[],
  parts: PartTemplate[],
  stock: StockConfig,
  cache?: RegionCache,
  options?: ComputeAdaptiveRegionsOptions
): ComputedRegions {
  if (placements.length === 0 || stock.width <= 0 || stock.length <= 0) {
    return { offcuts: EMPTY_LAYOUT_REGIONS, scrap: EMPTY_LAYOUT_REGIONS }
  }

  const skipPocket = options?.skipPocketPass === true
  const recordTimings = process.env.NODE_ENV !== "production" && options?.enableTimings === true

  // Closure: returns `performance.now()` only when timing is on, else
  // 0. Centralizing the conditional here keeps `computeAdaptiveRegions`
  // under the cyclomatic-complexity budget while still costing nothing
  // in production builds (DCE flattens `recordTimings` to `false`).
  const mark = (): number => (recordTimings ? performance.now() : 0)

  let envelopeWaste: Point2D[][]
  let pocketWaste: Point2D[][]
  let sideGapWaste: Point2D[][]

  const t0 = mark()
  let tSync = t0
  let tEnv = t0
  let tPocket = t0
  let tGap = t0

  if (cache != null) {
    // Cached path — sync the cache to the current placement set, then
    // pull pre-computed envelope/path/bbox per placement.
    const entries = syncRegionCache(cache, placements, parts)
    tSync = mark()
    envelopeWaste = []
    const partPaths: ClipperPath[] = []
    const bboxes: SideGapBbox[] = []
    for (const placement of placements) {
      const entry = entries.get(placement.id)
      if (entry == null) continue
      for (const poly of entry.envelopeWaste) envelopeWaste.push(poly)
      if (!skipPocket) partPaths.push(entry.sheetPath)
      bboxes.push(entry.bbox)
    }
    tEnv = mark()
    pocketWaste = skipPocket ? [] : computeTrappedPocketWasteFromPaths(partPaths, stock)
    tPocket = mark()
    sideGapWaste = computePerSideGapWasteFromBboxes(bboxes, stock)
    tGap = mark()
  } else {
    envelopeWaste = computeShapeEnvelopeWaste(placements, parts)
    tEnv = mark()
    pocketWaste = skipPocket ? [] : computeTrappedPocketWaste(placements, parts, stock)
    tPocket = mark()
    sideGapWaste = computePerSideGapWaste(placements, parts, stock)
    tGap = mark()
  }

  // Union all three signals via Clipper so overlapping waste (e.g. a
  // corner crescent that abuts a side gap) renders as one uniformly-
  // coloured region instead of compounding into darker patches.
  const merged = unionWasteRegions([...envelopeWaste, ...pocketWaste, ...sideGapWaste], [])
  const tUnion = mark()

  if (recordTimings) {
    __regionTimingSink.push({
      syncMs: tSync - t0,
      envelopeMs: tEnv - tSync,
      pocketMs: tPocket - tEnv,
      gapMs: tGap - tPocket,
      unionMs: tUnion - tGap,
      totalMs: tUnion - t0,
      placementCount: placements.length,
      skipPocket,
    })
  }

  return finalizeRegions(merged)
}
