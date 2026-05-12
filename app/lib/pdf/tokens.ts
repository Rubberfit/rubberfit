/**
 * Phase 7 — locked design tokens for every Rubberfit PDF.
 *
 * Source of truth for the eight-PDF redesign. Every consumer in
 * `app/lib/pdf/*` and the per-PDF builders (`job-pdf.ts`,
 * `cut-history-pdf.ts`, `roll-label-pdf.ts`, etc.) reads from this
 * file. Do NOT inline RGB triples, font sizes, or page constants in
 * a builder — that drift is exactly what Phase 7 closes.
 *
 * Kimi's authoritative direction lives at
 * `.claude/research/phase7/kimi-design-direction.md`. If you need to
 * change a value here, change the direction doc first and rerun the
 * Kimi sign-off pass — these constants ARE the design system.
 *
 * Purity rule (carried by `app/lib/pdf/README.md`): nothing in this
 * module may reference `document`, `window`, `Image`, `canvas`,
 * browser bwip, `toast`, or any other browser-only global. The
 * server-side cut-PDF route imports from here in Node runtime.
 */

// ── RGB triples (jsPDF takes 0-255 integers) ─────────────────────────────────

export type RGB = readonly [number, number, number]

/** Brand color — Arc & Anchor blue. Preserved from prior PDFs. */
export const BRAND_BLUE: RGB = [37, 99, 235]

/** Headings, totals row text. */
export const INK: RGB = [20, 20, 24]
/** Body text, table cells. */
export const CHARCOAL: RGB = [33, 37, 41]
/** Captions, footer text, eyebrows. */
export const SLATE: RGB = [100, 116, 139]
/** Horizontal rules, row strokes, borders. */
export const GHOST: RGB = [226, 232, 240]
/** Card fills, zebra striping, notes box fill. */
export const SURFACE: RGB = [248, 250, 252]
/** Page background; inverted text only. */
export const WHITE: RGB = [255, 255, 255]

/**
 * Semantic chip palettes: fill (light tint) / text (dark) / stroke.
 * Use via {@link STATUS_CHIPS}.
 */
export interface ChipPalette {
  readonly fill: RGB
  readonly text: RGB
  readonly stroke: RGB
}

export type ChipIntent = "info" | "success" | "warning" | "error"

export const STATUS_CHIPS: Readonly<Record<ChipIntent, ChipPalette>> = {
  info: { fill: [239, 246, 255], text: [30, 58, 138], stroke: BRAND_BLUE },
  success: { fill: [236, 253, 245], text: [6, 95, 70], stroke: [16, 185, 129] },
  warning: { fill: [254, 243, 199], text: [146, 64, 14], stroke: [245, 158, 11] },
  error: { fill: [254, 242, 242], text: [153, 27, 27], stroke: [239, 68, 68] },
}

// ── Type system (Helvetica + Courier — standard PDF fonts only) ─────────────

export type PdfFontFamily = "helvetica" | "courier"
export type PdfFontWeight = "normal" | "bold"

/**
 * Type role → font size / line height / weight. Hierarchy comes from
 * size, case, and spacing — never from weight beyond normal/bold (the
 * only weights jsPDF gives us without custom embedding).
 */
export interface TypeRole {
  readonly size: number
  readonly lineHeight: number
  readonly weight: PdfFontWeight
  readonly family: PdfFontFamily
}

export const TYPE: Readonly<
  Record<"display" | "h1" | "h2" | "body" | "caption" | "mono", TypeRole>
> = {
  /** Reserved for future cover pages — not used today. */
  display: { size: 24, lineHeight: 28, weight: "bold", family: "helvetica" },
  /** Document title in header. */
  h1: { size: 18, lineHeight: 24, weight: "bold", family: "helvetica" },
  /** Section headers; totals-row labels. */
  h2: { size: 14, lineHeight: 20, weight: "bold", family: "helvetica" },
  /** Prose, table cells, form values. */
  body: { size: 10, lineHeight: 16, weight: "normal", family: "helvetica" },
  /** Field labels, footers, chip text, timestamps. ALL CAPS by convention. */
  caption: { size: 8, lineHeight: 12, weight: "bold", family: "helvetica" },
  /** IDs, part numbers, barcodes, numeric columns. */
  mono: { size: 9, lineHeight: 12, weight: "normal", family: "courier" },
}

// ── Spacing — 4pt baseline grid ──────────────────────────────────────────────

/** Vertical rhythm unit. Every gap / padding multiple of this. */
export const BASELINE = 4

// ── Page system ──────────────────────────────────────────────────────────────

export type PdfCanvas = "customer" | "internal"

export interface PageGeometry {
  readonly width: number
  readonly height: number
  readonly margin: number
  /** width - margin * 2 */
  readonly contentWidth: number
}

/**
 * Customer-facing canvas — Letter, 48pt margin. Used by Job Sheet,
 * Purchase Order, Analytics Report.
 */
export const CUSTOMER_PAGE: PageGeometry = {
  width: 612,
  height: 792,
  margin: 48,
  contentWidth: 612 - 48 * 2,
}

/**
 * Internal-facing canvas — A4 in pt, 42pt margin. Used by Cut History,
 * Dashboard, Server Cut. The cut-history diagram body remains in mm
 * coordinates internally (founder Q3); the chrome wrapping it uses
 * these pt geometry numbers.
 *
 * A4 in pt: 595.28 × 841.89 — rounded to whole pt because all chrome
 * geometry is integer-multiple of the 4pt baseline.
 */
export const INTERNAL_PAGE: PageGeometry = {
  width: 595,
  height: 842,
  margin: 42,
  contentWidth: 595 - 42 * 2,
}

export const PAGE_BY_CANVAS: Readonly<Record<PdfCanvas, PageGeometry>> = {
  customer: CUSTOMER_PAGE,
  internal: INTERNAL_PAGE,
}

// ── Chrome geometry ──────────────────────────────────────────────────────────

/** Logo height in header (locked aspect, top-left). */
export const LOGO_HEIGHT = 20
/** Top-accent rule height — customer canvas only. */
export const CUSTOMER_ACCENT_HEIGHT = 3
/** Inset of the top-accent rule above the margin baseline. */
export const CUSTOMER_ACCENT_OFFSET = 6
/** Distance from header content baseline to the divider rule. */
export const HEADER_DIVIDER_OFFSET = 32
/** Header divider thickness. */
export const HEADER_DIVIDER_WIDTH = 0.5
/** Footer divider thickness — same as header. */
export const FOOTER_DIVIDER_WIDTH = 0.5
/** Distance from the bottom margin baseline up to the footer rule. */
export const FOOTER_DIVIDER_OFFSET = 16
/** Distance from the bottom margin baseline up to the footer text. */
export const FOOTER_TEXT_OFFSET = 4
/**
 * Vertical band content must NOT enter — measured up from the bottom
 * margin baseline. Equal to the footer divider offset plus one
 * baseline of breathing room. {@link contentBottomY} subtracts this
 * so {@link ensureSpace} triggers a page break before content overlaps
 * the footer.
 */
export const FOOTER_RESERVED_HEIGHT = FOOTER_DIVIDER_OFFSET + BASELINE * 2

// ── Component-primitive geometry ─────────────────────────────────────────────

/** KPI card — internal padding. */
export const KPI_PADDING = 12
/** KPI card top brand-blue border. */
export const KPI_TOP_BORDER = 2
/** KPI card minimum height (a single card without a unit suffix). */
export const KPI_MIN_HEIGHT = 56
/** Gap between adjacent KPI cards in a row. */
export const KPI_GAP = 12

/** Ruled-table header underline (brand blue). */
export const TABLE_HEADER_RULE = 1
/** Ruled-table row stroke (ghost). */
export const TABLE_ROW_STROKE = 0.25
/** Ruled-table totals top border (ink). */
export const TABLE_TOTALS_BORDER = 0.5
/** Ruled-table horizontal cell padding. */
export const TABLE_CELL_PADDING_X = 8

/** Status chip height. */
export const CHIP_HEIGHT = 16
/** Status chip horizontal padding. */
export const CHIP_PADDING_X = 8
/** Status chip stroke width. */
export const CHIP_STROKE = 0.5

/** Section divider rule height. */
export const DIVIDER_RULE = 2
/** Section divider gap between rule and the title. */
export const DIVIDER_GAP = 8

// ── Label geometry (small surfaces — labels skip full chrome) ────────────────

/** Top-rule height on labels (Roll Label spec). */
export const LABEL_TOP_RULE = 2
/** Page padding inside a label. */
export const LABEL_PADDING = 12
/** Header bar height on the public barcode label (Roll Barcode spec). */
export const BARCODE_HEADER_HEIGHT = 20
