import {
  MIN_REUSABLE_OFFCUT_WIDTH,
  MIN_REUSABLE_OFFCUT_HEIGHT,
  MIN_REUSABLE_STRIP_WIDTH,
  MIN_REUSABLE_STRIP_LENGTH,
} from "./nesting-visualizer-types"
import type { LayoutModel, LayoutRegion } from "./layout-model"

export type OffcutType = "Piece" | "Strip"

export interface OffcutSummaryRow {
  /** 1-based row number, also drawn as a marker inside the offcut on the diagram. */
  number: number
  /** 1-based roll index. */
  rollIndex: number
  /** Total roll count — used to decide whether to include the Roll column. */
  rollTotal: number
  region: LayoutRegion
  type: OffcutType
  areaSqFt: number
}

/**
 * Classify a region as a reusable Piece (≥ 11.5" × 12") or Strip
 * (≥ 6" × 24"), checking both orientations. Returns `null` for regions
 * that don't meet either threshold — those are operator-irrelevant scrap
 * even if they're connected to a reusable zone in the engine's CC graph.
 */
export function classifyOffcutType(region: LayoutRegion): OffcutType | null {
  const fits = (w: number, h: number) =>
    (region.width >= w && region.height >= h) || (region.width >= h && region.height >= w)
  if (fits(MIN_REUSABLE_OFFCUT_WIDTH, MIN_REUSABLE_OFFCUT_HEIGHT)) return "Piece"
  if (fits(MIN_REUSABLE_STRIP_WIDTH, MIN_REUSABLE_STRIP_LENGTH)) return "Strip"
  return null
}

/**
 * Produce one summary row per individually-reusable offcut across all rolls.
 *
 * `layout.offcuts` holds every rectangle in any reusable connected component
 * (see `classifyOffcutBands` in `nesting-offcut-utils.ts`), which means
 * sub-reusable rectangles ride along when they're adjacent to a reusable
 * neighbor. Filtering here by individual reusability gives the operator a
 * clean list of pieces they can actually reuse and avoids the historical
 * "stacked labels on adjacent rectangles" overlap that motivated labeling
 * only the largest offcut in the first place.
 *
 * Numbering is global across rolls so a single marker on the diagram maps
 * to a single row in the table without ambiguity.
 */
export function buildOffcutSummary(layouts: ReadonlyArray<LayoutModel>): OffcutSummaryRow[] {
  const rows: OffcutSummaryRow[] = []
  let counter = 0
  for (let i = 0; i < layouts.length; i++) {
    const layout = layouts[i]
    for (const region of layout.offcuts) {
      const type = classifyOffcutType(region)
      if (type == null) continue
      counter += 1
      rows.push({
        number: counter,
        rollIndex: i + 1,
        rollTotal: layouts.length,
        region,
        type,
        areaSqFt: (region.width * region.height) / 144,
      })
    }
  }
  return rows
}
