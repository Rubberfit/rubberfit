/**
 * Phase 7 — shared header / footer chrome for full-page Rubberfit PDFs.
 *
 * Every full-page PDF imports `drawCustomerChrome` or `drawInternalChrome`
 * (depending on its canvas) and `stampFooter`. The same header/footer
 * geometry appears across all PDFs so they read as siblings.
 *
 * Labels (roll label, barcode label) use the lighter `drawLabelTopRule` /
 * `drawBarcodeHeaderBar` helpers in `./primitives.ts` — they don't share
 * the full-page header.
 *
 * Purity rule (see `./README.md`): nothing here may reference `document`,
 * `window`, `Image`, browser canvas, or `toast`. The server-side cut PDF
 * route (Phase 7 PR 3) imports this from a Node runtime.
 */
import type { jsPDF } from "jspdf"

import {
  CUSTOMER_ACCENT_HEIGHT,
  CUSTOMER_ACCENT_OFFSET,
  FOOTER_DIVIDER_OFFSET,
  FOOTER_DIVIDER_WIDTH,
  FOOTER_TEXT_OFFSET,
  HEADER_DIVIDER_OFFSET,
  HEADER_DIVIDER_WIDTH,
  INK,
  PAGE_BY_CANVAS,
  type PdfCanvas,
  RULE,
  SIGNAL,
  SLATE,
  TYPE,
  WHITE,
} from "./tokens"

export interface ChromeOptions {
  /**
   * Document title rendered on the right-hand side of the header, e.g.
   * "JOB SHEET", "PURCHASE ORDER". Kimi's spec keeps it H1 (18pt Bold).
   */
  readonly title: string
  /**
   * Optional second line under the title — usually a record id such as
   * "J-000124" or "PO-2026-0042". Mono small print.
   */
  readonly subtitle?: string
  /**
   * @deprecated Phase 7 brand correction (2026-05-12) removed the
   * compass-rose Arc & Anchor logo from PDFs. The wordmark is now
   * typographic — Helvetica Bold 9pt all-caps "RUBBERFIT" + signal
   * underline. Any value passed here is ignored. Kept on the type so
   * existing callers compile while they're being migrated.
   */
  readonly logoDataUrl?: string
  /**
   * Brand wordmark in the top-right header. Defaults to "RUBBERFIT".
   * Pass a different value only if a per-PDF call needs custom
   * branding (e.g., white-label exports).
   */
  readonly brandLockup?: string
}

const DEFAULT_BRAND_LOCKUP = "RUBBERFIT"
const BRAND_UNDERLINE_WIDTH = 24
const BRAND_UNDERLINE_STROKE = 0.5

function setFillRgb(doc: jsPDF, [r, g, b]: readonly [number, number, number]): void {
  doc.setFillColor(r, g, b)
}

function setDrawRgb(doc: jsPDF, [r, g, b]: readonly [number, number, number]): void {
  doc.setDrawColor(r, g, b)
}

function setTextRgb(doc: jsPDF, [r, g, b]: readonly [number, number, number]): void {
  doc.setTextColor(r, g, b)
}

function applyType(doc: jsPDF, role: keyof typeof TYPE): void {
  const t = TYPE[role]
  doc.setFont(t.family, t.weight)
  doc.setFontSize(t.size)
}

/**
 * Shared header drawer. Phase 7 brand-correction state:
 *
 *   • No raster logo (the compass-rose Arc & Anchor image was wrong
 *     for the Rubberfit-branded PDFs; Kimi removed it).
 *   • Right-aligned typographic wordmark "RUBBERFIT" with a 0.5pt
 *     signal-orange underline — the "inspection stamp" cue carries
 *     the brand identity without an image asset.
 *   • Customer canvases still get the 3pt accent rule above the
 *     margin baseline, now signal orange.
 */
function drawChromeHeader(doc: jsPDF, canvas: PdfCanvas, opts: ChromeOptions): void {
  const geom = PAGE_BY_CANVAS[canvas]
  const { margin, width } = geom
  const lockup = opts.brandLockup ?? DEFAULT_BRAND_LOCKUP

  // Customer-only premium accent rule — signal orange, top of page.
  if (canvas === "customer") {
    const accentY = margin - CUSTOMER_ACCENT_OFFSET - CUSTOMER_ACCENT_HEIGHT
    setFillRgb(doc, SIGNAL)
    doc.rect(margin, accentY, geom.contentWidth, CUSTOMER_ACCENT_HEIGHT, "F")
  }

  // Wordmark — Helvetica Bold 9pt ALL CAPS in ink, right-aligned.
  applyType(doc, "caption")
  doc.setFontSize(9)
  setTextRgb(doc, INK)
  doc.text(lockup, width - margin, margin + 6, { align: "right" })

  // Inspection-stamp underline — 0.5pt signal-orange, 24pt wide,
  // flush right, 2pt below the wordmark baseline.
  setDrawRgb(doc, SIGNAL)
  doc.setLineWidth(BRAND_UNDERLINE_STROKE)
  doc.line(width - margin - BRAND_UNDERLINE_WIDTH, margin + 8, width - margin, margin + 8)

  // Document title — H1 (18pt Bold), right-aligned, ink color.
  applyType(doc, "h1")
  setTextRgb(doc, INK)
  doc.text(opts.title, width - margin, margin + 22, { align: "right" })

  // Optional subtitle — body-size mono, right-aligned, slate.
  if (opts.subtitle) {
    applyType(doc, "mono")
    setTextRgb(doc, SLATE)
    doc.text(opts.subtitle, width - margin, margin + 32, { align: "right" })
  }

  // Divider rule — warm rule color, full content width.
  setDrawRgb(doc, RULE)
  doc.setLineWidth(HEADER_DIVIDER_WIDTH)
  const dividerY = margin + HEADER_DIVIDER_OFFSET
  doc.line(margin, dividerY, width - margin, dividerY)
}

/**
 * Draws the customer-canvas header (Letter geometry, 48pt margin,
 * with the 3pt brand-blue top accent rule). Use for Job Sheet,
 * Purchase Order, Analytics Report.
 */
export function drawCustomerChrome(doc: jsPDF, opts: ChromeOptions): void {
  drawChromeHeader(doc, "customer", opts)
}

/**
 * Draws the internal-canvas header (A4 geometry, 42pt margin, no
 * top accent rule). Use for Cut History, Dashboard, Server Cut.
 */
export function drawInternalChrome(doc: jsPDF, opts: ChromeOptions): void {
  drawChromeHeader(doc, "internal", opts)
}

/**
 * The Y coordinate where document content can start (immediately below
 * the header divider, plus one baseline of breathing room).
 */
export function contentStartY(canvas: PdfCanvas): number {
  return PAGE_BY_CANVAS[canvas].margin + HEADER_DIVIDER_OFFSET + TYPE.body.lineHeight
}

export interface FooterOptions {
  /** 1-indexed current page number. */
  readonly pageNumber: number
  /** Total page count for the document. */
  readonly totalPages: number
  /**
   * Right-aligned identifier — usually `${docId} • ${timestamp}`.
   * Mono 8pt Slate.
   */
  readonly docMeta: string
  /**
   * Left-aligned product mark. Defaults to "Rubberfit".
   */
  readonly productMark?: string
}

/**
 * Stamps the footer on the CURRENT page only. Callers stamp every
 * page in a post-pass once `doc.getNumberOfPages()` is known, so the
 * "n of N" pair stays accurate.
 *
 * Geometry: 0.5pt ghost rule + 3-column row (left = product mark,
 * center = page counter, right = docMeta).
 */
export function stampFooter(doc: jsPDF, canvas: PdfCanvas, opts: FooterOptions): void {
  const geom = PAGE_BY_CANVAS[canvas]
  const { margin, width, height } = geom
  const productMark = opts.productMark ?? "Rubberfit"

  // Divider above the footer text.
  setDrawRgb(doc, RULE)
  doc.setLineWidth(FOOTER_DIVIDER_WIDTH)
  const ruleY = height - margin - FOOTER_DIVIDER_OFFSET
  doc.line(margin, ruleY, width - margin, ruleY)

  // Text row — all caption size, slate. Center uses mono for the counter.
  const textY = height - margin - FOOTER_TEXT_OFFSET
  applyType(doc, "caption")
  setTextRgb(doc, SLATE)
  doc.text(productMark, margin, textY)
  doc.text(opts.docMeta, width - margin, textY, { align: "right" })

  applyType(doc, "mono")
  setTextRgb(doc, SLATE)
  const center = width / 2
  doc.text(`Page ${opts.pageNumber} of ${opts.totalPages}`, center, textY, { align: "center" })
}

/**
 * Convenience: stamp the footer on every page of the document. Call
 * AFTER all content is laid out so `getNumberOfPages()` is final.
 *
 * `metaBuilder` receives the 1-indexed page number and returns the
 * right-aligned meta string for that page. Most callers return a
 * constant `${docId} • ${timestamp}`.
 */
export function stampFooterOnEveryPage(
  doc: jsPDF,
  canvas: PdfCanvas,
  metaBuilder: (page: number) => string,
  productMark?: string
): void {
  const total = doc.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    stampFooter(doc, canvas, {
      pageNumber: page,
      totalPages: total,
      docMeta: metaBuilder(page),
      productMark,
    })
  }
}

/**
 * Resets the doc's draw / fill / text colors to white so a stray
 * fill call from earlier chrome doesn't leak into caller code. Most
 * builders call this once at the boundary between chrome and content.
 */
export function resetColors(doc: jsPDF): void {
  setFillRgb(doc, WHITE)
  setDrawRgb(doc, RULE)
  setTextRgb(doc, INK)
}
