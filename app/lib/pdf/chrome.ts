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
  BRAND_BLUE,
  CUSTOMER_ACCENT_HEIGHT,
  CUSTOMER_ACCENT_OFFSET,
  FOOTER_DIVIDER_OFFSET,
  FOOTER_DIVIDER_WIDTH,
  FOOTER_TEXT_OFFSET,
  GHOST,
  HEADER_DIVIDER_OFFSET,
  HEADER_DIVIDER_WIDTH,
  INK,
  LOGO_HEIGHT,
  PAGE_BY_CANVAS,
  type PdfCanvas,
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
   * Base64-encoded logo image. Caller passes the JPEG/PNG `data:`-style
   * string. Optional so callers can defer logo loading to a per-PDF
   * helper without crashing the chrome.
   */
  readonly logoDataUrl?: string
  /**
   * Brand lockup text shown in caption case above the title. Defaults to
   * "ARC & ANCHOR / RUBBERFIT".
   */
  readonly brandLockup?: string
}

const DEFAULT_BRAND_LOCKUP = "ARC & ANCHOR / RUBBERFIT"

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
 * Shared header drawer. `accent` controls the 3pt brand-blue rule above
 * the margin baseline — present on customer canvases, absent on internal.
 */
function drawChromeHeader(doc: jsPDF, canvas: PdfCanvas, opts: ChromeOptions): void {
  const geom = PAGE_BY_CANVAS[canvas]
  const { margin, width } = geom
  const lockup = opts.brandLockup ?? DEFAULT_BRAND_LOCKUP

  // Customer-only premium accent rule — sits above the margin baseline.
  if (canvas === "customer") {
    const accentY = margin - CUSTOMER_ACCENT_OFFSET - CUSTOMER_ACCENT_HEIGHT
    setFillRgb(doc, BRAND_BLUE)
    doc.rect(margin, accentY, geom.contentWidth, CUSTOMER_ACCENT_HEIGHT, "F")
  }

  // Logo — top-left, locked aspect, fixed height. Caller may omit
  // (e.g. tests that don't bundle the asset); the rest of the header
  // still renders so the document remains readable. We also wrap the
  // call in try/catch so a malformed dataURL — wrong MIME, broken
  // base64, missing image data — degrades to text-only chrome
  // instead of throwing during a customer PDF render.
  //
  // Format detection: jsPDF's magic-byte recognition usually wins
  // even if we pass the wrong format string, but being explicit is
  // both more honest and protects the fallback path if recognition
  // ever fails on a PNG that arrived through an opaque dataURL.
  if (opts.logoDataUrl) {
    const format = opts.logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG"
    try {
      // jsPDF infers width from the loaded image when height is given
      // via the explicit aspect-preserving overload (width=0 forces
      // inference).
      doc.addImage(opts.logoDataUrl, format, margin, margin, 0, LOGO_HEIGHT, undefined, "FAST")
    } catch (_error) {
      // Silent fallback: skip the logo. The brand lockup + title
      // already identify the document, so a missing logo doesn't
      // make the PDF unreadable.
    }
  }

  // Brand lockup — caption (8pt Bold ALL CAPS) in brand blue, right-aligned.
  applyType(doc, "caption")
  setTextRgb(doc, BRAND_BLUE)
  doc.text(lockup, width - margin, margin + 6, { align: "right" })

  // Document title — H1 (18pt Bold), right-aligned, ink color.
  applyType(doc, "h1")
  setTextRgb(doc, INK)
  doc.text(opts.title, width - margin, margin + 18, { align: "right" })

  // Optional subtitle — body-size mono, right-aligned, slate.
  if (opts.subtitle) {
    applyType(doc, "mono")
    setTextRgb(doc, SLATE)
    doc.text(opts.subtitle, width - margin, margin + 30, { align: "right" })
  }

  // Divider rule — ghost, full content width, at margin + 32.
  setDrawRgb(doc, GHOST)
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
  setDrawRgb(doc, GHOST)
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
  setDrawRgb(doc, GHOST)
  setTextRgb(doc, INK)
}
