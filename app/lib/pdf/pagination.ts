/**
 * Phase 7 — pagination + page-break helpers for Rubberfit PDFs.
 *
 * Multi-page PDFs (cut history, analytics report, multi-PO export)
 * lose pagination consistency when each consumer writes its own
 * `if (cursor > pageBottom) doc.addPage()` math inline. This module
 * centralizes that decision so footers and table headers don't
 * drift across pages.
 *
 * Purity rule (see `./README.md`): no browser-only imports.
 */
import type { jsPDF } from "jspdf"

import { FOOTER_RESERVED_HEIGHT, PAGE_BY_CANVAS, type PdfCanvas } from "./tokens"

export interface PageBreakOptions {
  /**
   * Current Y cursor in pt.
   */
  readonly cursor: number
  /**
   * How much vertical space the next block needs in pt. If the
   * cursor + neededHeight would overflow the page's bottom margin,
   * we add a page and call `redrawChrome` to put the header back.
   */
  readonly neededHeight: number
  /**
   * Which canvas we're rendering in — used to look up the bottom
   * margin where content must end.
   */
  readonly canvas: PdfCanvas
  /**
   * Called on every NEW page to reapply the document chrome
   * (header, perhaps a KPI strip caller wants repeated). Returns
   * the new content Y cursor on the fresh page.
   *
   * Returning the Y cursor lets the helper hand it back transparently
   * regardless of how tall the chrome is.
   */
  readonly redrawChrome: (doc: jsPDF) => number
}

/**
 * If the next block needs more space than the current page has left,
 * call `doc.addPage()` + the caller's `redrawChrome`, and return the
 * fresh Y cursor. Otherwise return the current cursor unchanged.
 *
 * Footer is NOT stamped here — callers stamp footers in a final pass
 * via {@link import("./chrome").stampFooterOnEveryPage} once content
 * is fully laid out.
 */
export function ensureSpace(doc: jsPDF, opts: PageBreakOptions): number {
  const { cursor, neededHeight, canvas, redrawChrome } = opts
  const bottomLimit = contentBottomY(canvas)

  if (cursor + neededHeight <= bottomLimit) {
    return cursor
  }

  doc.addPage()
  return redrawChrome(doc)
}

/**
 * The Y coordinate where content must end. Subtracts the footer
 * reserved band ({@link FOOTER_RESERVED_HEIGHT}) so the content
 * cursor can never enter the footer's vertical strip — a regression
 * Codex caught in PR 1 review (table rows would have collided with
 * footer dividers in PR 2).
 */
export function contentBottomY(canvas: PdfCanvas): number {
  const geom = PAGE_BY_CANVAS[canvas]
  return geom.height - geom.margin - FOOTER_RESERVED_HEIGHT
}
