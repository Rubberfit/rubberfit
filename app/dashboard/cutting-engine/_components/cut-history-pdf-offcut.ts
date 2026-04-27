import {
  MIN_REUSABLE_OFFCUT_WIDTH,
  MIN_REUSABLE_OFFCUT_HEIGHT,
  MIN_REUSABLE_STRIP_WIDTH,
  MIN_REUSABLE_STRIP_LENGTH,
} from "./nesting-visualizer-types"
import type { LayoutModel, LayoutRegion } from "./layout-model"

export type OffcutType = "Piece" | "Strip"

export interface OffcutSummaryRow {
  /** 1-based row number, globally continuous across rolls; also drawn as a marker on the diagram. */
  number: number
  /** 1-based roll index — drives the Roll column in the summary table. */
  rollIndex: number
  /** Total roll count — used to decide whether to include the Roll column. */
  rollTotal: number
  region: LayoutRegion
  type: OffcutType
  areaSqFt: number
}

/**
 * Label a reusable region as a Piece (≥ 11.5" × 12") or fall back to Strip
 * for everything else. We don't filter — every rectangle the engine ships
 * in `layout.offcuts` is already pre-classified as reusable upstream by
 * `classifyOffcutBands`, so a thin band that doesn't meet Piece dimensions
 * still gets marked, just under the Strip label.
 */
export function classifyOffcutType(region: LayoutRegion): OffcutType {
  const fits = (w: number, h: number) =>
    (region.width >= w && region.height >= h) || (region.width >= h && region.height >= w)
  if (fits(MIN_REUSABLE_OFFCUT_WIDTH, MIN_REUSABLE_OFFCUT_HEIGHT)) return "Piece"
  return "Strip"
}

const TOUCH_EPS = 0.1 // inches
// Pure edge-touch clustering threshold. Two rectangles that only share
// a sliver — e.g., a 1" wide vertical strip kissing the corner of a 1"
// tall bottom strip on the same roll — visually represent two
// SEPARATE offcuts to the operator, not one zone. Require the shared
// edge to be at least the strip-reusable width (6") so genuine
// neighbors merge while sliver-contacts stay distinct.
const SHARED_EDGE_MIN_IN = 6

/**
 * Two regions belong to the same visual offcut zone when they
 * genuinely overlap, OR share an edge of at least `SHARED_EDGE_MIN_IN`
 * inches. Pure corner / sliver contact is treated as separate zones —
 * that matches how an operator reads the diagram, even though the
 * engine's CC analysis lumps them together internally.
 */
function regionsTouch(a: LayoutRegion, b: LayoutRegion): boolean {
  const ax2 = a.x + a.width
  const ay2 = a.y + a.height
  const bx2 = b.x + b.width
  const by2 = b.y + b.height
  const xOverlap = Math.min(ax2, bx2) - Math.max(a.x, b.x)
  const yOverlap = Math.min(ay2, by2) - Math.max(a.y, b.y)

  // Genuine 2D overlap — rects intersect on interior, not just at a boundary.
  if (xOverlap > TOUCH_EPS && yOverlap > TOUCH_EPS) return true

  // Pure horizontal-edge sharing: y-extents touch (yOverlap ≈ 0), and
  // they overlap on x by at least SHARED_EDGE_MIN_IN.
  if (Math.abs(yOverlap) <= TOUCH_EPS && xOverlap >= SHARED_EDGE_MIN_IN) return true

  // Pure vertical-edge sharing.
  if (Math.abs(xOverlap) <= TOUCH_EPS && yOverlap >= SHARED_EDGE_MIN_IN) return true

  return false
}

/**
 * BFS the offcut list into connected-component groups. Adjacent
 * rectangles end up in one group; isolated rectangles become singletons.
 */
function groupConnectedComponents(regions: ReadonlyArray<LayoutRegion>): LayoutRegion[][] {
  const visited = new Array(regions.length).fill(false) as boolean[]
  const groups: LayoutRegion[][] = []
  for (let start = 0; start < regions.length; start++) {
    if (visited[start]) continue
    const group: LayoutRegion[] = []
    const queue = [start]
    visited[start] = true
    while (queue.length > 0) {
      const idx = queue.shift() as number
      group.push(regions[idx])
      for (let j = 0; j < regions.length; j++) {
        if (visited[j]) continue
        if (regionsTouch(regions[idx], regions[j])) {
          visited[j] = true
          queue.push(j)
        }
      }
    }
    groups.push(group)
  }
  return groups
}

/** Pick the largest-area rectangle from a CC group — that's the
 *  operator-actionable piece + the right anchor for the marker chip. */
function pickCanonical(group: LayoutRegion[]): LayoutRegion {
  let best = group[0]
  let bestArea = best.width * best.height
  for (let i = 1; i < group.length; i++) {
    const r = group[i]
    const a = r.width * r.height
    if (a > bestArea) {
      best = r
      bestArea = a
    }
  }
  return best
}

/**
 * Produce one summary row per **reusable offcut zone** (connected
 * component of adjacent rectangles), across all rolls.
 *
 * Why grouping: `layout.offcuts` ships every rectangle in any reusable
 * connected component (see `classifyOffcutBands`), which means a single
 * visual offcut zone can be split into 3-4 adjacent sub-rectangles that
 * each individually qualify as reusable. Without grouping we emit a
 * marker chip per sub-rectangle, which clusters 4 chips inside one zone
 * and visually looks broken.
 *
 * Why no threshold filter: the upstream engine already filters scrap
 * out of `layout.offcuts` — anything that lands here is a zone the
 * operator should see. The previous threshold pass was rejecting visible
 * amber zones in the PDF, so the operator saw an offcut with no marker.
 *
 * Numbering is **globally continuous** across rolls (Roll 1 → 1,
 * Roll 2 keeps counting from where Roll 1 ended). The summary table
 * then matches the diagram chips one-for-one without ambiguity.
 *
 *   - `areaSqFt` sums every rect in the zone — operators see the true
 *     recoverable material in that zone, not just the canonical rect.
 *   - `region` is the canonical (largest) rect, used to anchor the
 *     marker chip on the diagram.
 */
export function buildOffcutSummary(layouts: ReadonlyArray<LayoutModel>): OffcutSummaryRow[] {
  const rows: OffcutSummaryRow[] = []
  let runningNumber = 0
  for (let i = 0; i < layouts.length; i++) {
    const layout = layouts[i]
    const groups = groupConnectedComponents(layout.offcuts)
    for (const group of groups) {
      const canonical = pickCanonical(group)
      runningNumber += 1
      const totalSqIn = group.reduce((sum, r) => sum + r.width * r.height, 0)
      rows.push({
        number: runningNumber,
        rollIndex: i + 1,
        rollTotal: layouts.length,
        region: canonical,
        type: classifyOffcutType(canonical),
        areaSqFt: totalSqIn / 144,
      })
    }
  }
  return rows
}
