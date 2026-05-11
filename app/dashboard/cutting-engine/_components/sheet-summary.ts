import type { SheetPreview } from "./nesting-visualizer-types"

/**
 * Builds the screen-reader summary spoken when keyboard focus enters
 * a detail-view `<svg>` region (Phase 5 PR 6). Wired via
 * `aria-describedby` on the SVG element pointing at a visually-hidden
 * `<span>` rendered alongside it.
 *
 * Refresh trigger: re-runs only when the active sheet's preview
 * changes (sheet index, layout reshape, repack). NOT on selection
 * changes — selection has its own `aria-live` region in
 * `nesting-viz-simple-mode.tsx`. Mixing both channels would
 * over-announce.
 *
 * Format: sentence-case, percent spelled out ("14 percent"), no
 * trailing period (announcers add their own pause). Partial status
 * appended only when truthy. Individual tag letters intentionally
 * omitted — the summary is sheet-level; granular part data is
 * available by tabbing the accessible part buttons inside the SVG.
 */
export function buildSheetSummary(
  sheet: SheetPreview,
  totalSheets: number,
  /**
   * THIS sheet's stock area in square inches (NOT the multi-sheet
   * total). Codex caught a real bug in the first cut of PR 6 where
   * per-sheet percentages were divided by the all-sheets total area —
   * "13 percent scrap on Sheet 1 of 3" then meant "13 percent of all
   * stock," which is meaningless to an operator inspecting one sheet.
   */
  sheetStockArea: number
): string {
  const partsPlaced = sheet.preview.piecesShown
  const scrapPct = sheetStockArea > 0 ? (sheet.preview.scrapArea / sheetStockArea) * 100 : 0
  const reusablePct = sheetStockArea > 0 ? (sheet.preview.reusableArea / sheetStockArea) * 100 : 0
  const sheetLabel = totalSheets > 1 ? `Sheet ${sheet.sheetIndex + 1} of ${totalSheets}` : "Sheet"
  const partsLabel = `${partsPlaced} ${partsPlaced === 1 ? "part" : "parts"} placed`
  const partial = sheet.isPartial ? ", partial sheet" : ""
  return (
    `${sheetLabel}: ${partsLabel}, ` +
    `${scrapPct.toFixed(0)} percent scrap, ` +
    `${reusablePct.toFixed(0)} percent reusable offcut${partial}`
  )
}
