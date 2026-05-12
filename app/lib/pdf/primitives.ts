/**
 * Phase 7 — shared drawing primitives for Rubberfit PDFs.
 *
 * Every component pattern Kimi specified — KPI card, ruled table,
 * status chip, section divider, signature/notes block, label
 * accents — lives here. Per-PDF builders compose these primitives
 * instead of pixel-pushing them inline. That's how the eight PDFs
 * read as siblings.
 *
 * Purity rule (see `./README.md`): nothing here may reference
 * `document`, `window`, `Image`, browser canvas, or `toast`. The
 * server-side cut PDF route depends on this purity.
 */
import type { jsPDF } from "jspdf"

import {
  BARCODE_HEADER_HEIGHT,
  BRAND_BLUE,
  BASELINE,
  type ChipIntent,
  CHIP_HEIGHT,
  CHIP_PADDING_X,
  CHIP_STROKE,
  CHARCOAL,
  DIVIDER_GAP,
  DIVIDER_RULE,
  GHOST,
  INK,
  KPI_MIN_HEIGHT,
  KPI_PADDING,
  KPI_TOP_BORDER,
  LABEL_TOP_RULE,
  type RGB,
  SLATE,
  STATUS_CHIPS,
  SURFACE,
  TABLE_CELL_PADDING_X,
  TABLE_HEADER_RULE,
  TABLE_ROW_STROKE,
  TABLE_TOTALS_BORDER,
  TYPE,
  WHITE,
} from "./tokens"

function setFillRgb(doc: jsPDF, [r, g, b]: RGB): void {
  doc.setFillColor(r, g, b)
}

function setDrawRgb(doc: jsPDF, [r, g, b]: RGB): void {
  doc.setDrawColor(r, g, b)
}

function setTextRgb(doc: jsPDF, [r, g, b]: RGB): void {
  doc.setTextColor(r, g, b)
}

function applyType(doc: jsPDF, role: keyof typeof TYPE): void {
  const t = TYPE[role]
  doc.setFont(t.family, t.weight)
  doc.setFontSize(t.size)
}

// ── KPI card ─────────────────────────────────────────────────────────────────

export interface KpiCardOptions {
  readonly x: number
  readonly y: number
  readonly width: number
  /** Card height. Defaults to {@link KPI_MIN_HEIGHT}. */
  readonly height?: number
  /** ALL-CAPS caption label, e.g. "TOTAL PARTS". */
  readonly label: string
  /** Primary metric value, e.g. "1,248". */
  readonly value: string
  /** Optional unit suffix shown small to the right of the value, e.g. "PARTS". */
  readonly unit?: string
}

/**
 * Draws a KPI card per Kimi's spec: Surface fill, 2pt brand-blue top
 * border, no other strokes. Caption label top-left in slate ALL CAPS;
 * H2 value below in ink; optional caption unit to the right of value.
 */
export function drawKpiCard(doc: jsPDF, opts: KpiCardOptions): void {
  const { x, y, width, label, value, unit } = opts
  const height = opts.height ?? KPI_MIN_HEIGHT

  // Card body.
  setFillRgb(doc, SURFACE)
  doc.rect(x, y, width, height, "F")

  // Brand-blue top border.
  setFillRgb(doc, BRAND_BLUE)
  doc.rect(x, y, width, KPI_TOP_BORDER, "F")

  // Label — caption (8pt bold caps) in slate.
  applyType(doc, "caption")
  setTextRgb(doc, SLATE)
  doc.text(label.toUpperCase(), x + KPI_PADDING, y + KPI_PADDING + TYPE.caption.size)

  // Value — H2 (14pt bold) in ink. Baseline = 24pt below label top per Kimi.
  applyType(doc, "h2")
  setTextRgb(doc, INK)
  const valueBaseline = y + KPI_PADDING + TYPE.caption.size + 16
  doc.text(value, x + KPI_PADDING, valueBaseline)

  // Optional unit — caption to the right of value with a 6pt gap.
  if (unit) {
    const valueWidth = doc.getTextWidth(value)
    applyType(doc, "caption")
    setTextRgb(doc, SLATE)
    doc.text(unit, x + KPI_PADDING + valueWidth + 6, valueBaseline)
  }
}

// ── Ruled table ──────────────────────────────────────────────────────────────

export type TableAlign = "left" | "right"

export interface TableColumn {
  readonly header: string
  /** Pre-resolved pt width per column. Caller does the layout math. */
  readonly width: number
  /** Cell text alignment. Numeric columns right-align. */
  readonly align?: TableAlign
  /** Use mono (Courier 9pt) for cell text. Numeric / ID columns. */
  readonly mono?: boolean
}

export interface TableRowOptions {
  /** Override cell text per column index. Missing keys render empty. */
  readonly cells: ReadonlyArray<string>
  /** Force this row into the totals (top border, bold, transparent fill). */
  readonly isTotals?: boolean
}

export interface RuledTableOptions {
  readonly x: number
  readonly y: number
  readonly columns: ReadonlyArray<TableColumn>
  readonly rows: ReadonlyArray<TableRowOptions>
  /**
   * Body row height. Defaults to one body line-height (16pt) — the 4pt
   * baseline keeps cells aligned to the grid.
   */
  readonly rowHeight?: number
  /** Header row height. Defaults to body row height. */
  readonly headerHeight?: number
}

const DEFAULT_ROW_HEIGHT = TYPE.body.lineHeight + BASELINE * 2 // 16 + 8 = 24pt

/**
 * Draws a ruled table per Kimi's spec:
 *
 *   • Header — transparent fill, 9pt Bold ALL CAPS, 1pt brand-blue
 *     bottom border. No vertical strokes.
 *   • Rows — 0.25pt ghost stroke between rows. No alternating fill
 *     by default (zebra is the consumer's call — pass row.isTotals
 *     for the totals row only).
 *   • Totals row — 0.5pt ink top border, transparent fill, bold body.
 *   • Numeric columns right-align; mono columns use Courier 9pt.
 *
 * Returns the Y coordinate just below the table (caller's next cursor).
 */
export function drawRuledTable(doc: jsPDF, opts: RuledTableOptions): number {
  const { x, y, columns, rows } = opts
  const rowHeight = opts.rowHeight ?? DEFAULT_ROW_HEIGHT
  const headerHeight = opts.headerHeight ?? rowHeight
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0)

  // ── Header row ──────────────────────────────────────────────────────────
  applyType(doc, "caption")
  doc.setFontSize(9) // Kimi: "Text 9 pt Bold, Ink, ALL CAPS"
  setTextRgb(doc, INK)
  let colX = x
  for (const col of columns) {
    const headerText = col.header.toUpperCase()
    const textX =
      col.align === "right" ? colX + col.width - TABLE_CELL_PADDING_X : colX + TABLE_CELL_PADDING_X
    const baseline = y + headerHeight - BASELINE - 2
    doc.text(headerText, textX, baseline, { align: col.align === "right" ? "right" : "left" })
    colX += col.width
  }
  // Brand-blue underline under header row.
  setDrawRgb(doc, BRAND_BLUE)
  doc.setLineWidth(TABLE_HEADER_RULE)
  doc.line(x, y + headerHeight, x + tableWidth, y + headerHeight)

  // ── Body rows ───────────────────────────────────────────────────────────
  // Zebra striping is intentionally NOT applied by default — Kimi's
  // spec says alternating fill is a per-table call and most surfaces
  // (Job Sheet parts table, PO line items) read better without it.
  // When a future consumer needs zebra rows, add a `zebra: boolean`
  // flag to `RuledTableOptions` and shade rows here.
  let cursor = y + headerHeight
  for (const row of rows) {
    if (row.isTotals) {
      // 0.5pt ink top border for totals row.
      setDrawRgb(doc, INK)
      doc.setLineWidth(TABLE_TOTALS_BORDER)
      doc.line(x, cursor, x + tableWidth, cursor)
    }

    // Cell text per column.
    setTextRgb(doc, INK)
    let cellX = x
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i]
      if (!col) continue
      const cellText = row.cells[i] ?? ""
      if (col.mono) {
        applyType(doc, "mono")
      } else if (row.isTotals) {
        applyType(doc, "body")
        doc.setFont(TYPE.body.family, "bold")
      } else {
        applyType(doc, "body")
      }
      const textX =
        col.align === "right"
          ? cellX + col.width - TABLE_CELL_PADDING_X
          : cellX + TABLE_CELL_PADDING_X
      const baseline = cursor + rowHeight - BASELINE - 2
      doc.text(cellText, textX, baseline, { align: col.align === "right" ? "right" : "left" })
      cellX += col.width
    }

    cursor += rowHeight

    // Between-rows ghost stroke — skipped after the totals row (it's the bottom).
    if (!row.isTotals) {
      setDrawRgb(doc, GHOST)
      doc.setLineWidth(TABLE_ROW_STROKE)
      doc.line(x, cursor, x + tableWidth, cursor)
    }
  }

  return cursor
}

// ── Status chip ──────────────────────────────────────────────────────────────

export interface StatusChipOptions {
  readonly x: number
  readonly y: number
  readonly label: string
  readonly intent: ChipIntent
}

/**
 * Draws a status chip per Kimi's spec: 16pt tall, 8pt horizontal
 * padding, semantic tint fill + 0.5pt stroke, caption-bold text
 * vertically centered. Returns the chip's outer width so callers
 * can position adjacent content.
 */
export function drawStatusChip(doc: jsPDF, opts: StatusChipOptions): number {
  const { x, y, label, intent } = opts
  const palette = STATUS_CHIPS[intent]

  // Measure text width before painting.
  applyType(doc, "caption")
  const textWidth = doc.getTextWidth(label)
  const chipWidth = textWidth + CHIP_PADDING_X * 2

  setFillRgb(doc, palette.fill)
  setDrawRgb(doc, palette.stroke)
  doc.setLineWidth(CHIP_STROKE)
  doc.rect(x, y, chipWidth, CHIP_HEIGHT, "FD")

  setTextRgb(doc, palette.text)
  // Vertical center: chip top (y) + half height - half cap height.
  const baseline = y + CHIP_HEIGHT / 2 + TYPE.caption.size / 2 - 1
  doc.text(label, x + CHIP_PADDING_X, baseline)

  return chipWidth
}

// ── Section divider ──────────────────────────────────────────────────────────

export interface SectionDividerOptions {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly title: string
}

/**
 * Draws a section divider per Kimi's spec: 2pt brand-blue rule + 8pt
 * gap + H2 title. Returns the Y just below the title baseline so the
 * caller can pick up the cursor.
 */
export function drawSectionDivider(doc: jsPDF, opts: SectionDividerOptions): number {
  const { x, y, width, title } = opts
  setFillRgb(doc, BRAND_BLUE)
  doc.rect(x, y, width, DIVIDER_RULE, "F")

  applyType(doc, "h2")
  setTextRgb(doc, INK)
  const titleBaseline = y + DIVIDER_RULE + DIVIDER_GAP + TYPE.h2.size
  doc.text(title, x, titleBaseline)
  return titleBaseline
}

// ── Signature / notes block ──────────────────────────────────────────────────

export interface SignatureBlockOptions {
  readonly x: number
  readonly y: number
  readonly width: number
  /** Body text rendered inside the block before the signature line. */
  readonly body?: string
  /** Caption rendered beneath the dashed line. Defaults to "AUTHORIZED SIGNATURE". */
  readonly caption?: string
}

const SIGNATURE_LINE_LENGTH = 200

/**
 * Draws a signature / notes block per Kimi's spec. Returns the Y
 * just below the caption (caller's next cursor).
 */
export function drawSignatureBlock(doc: jsPDF, opts: SignatureBlockOptions): number {
  const { x, y, width, body } = opts
  const caption = opts.caption ?? "AUTHORIZED SIGNATURE"

  // Box — surface fill + ghost 0.5pt stroke.
  setFillRgb(doc, SURFACE)
  setDrawRgb(doc, GHOST)
  doc.setLineWidth(0.5)
  // Height is content-driven; default to 64pt (one body line + signature line + caption).
  const blockHeight = 64
  doc.rect(x, y, width, blockHeight, "FD")

  // Optional body text — body, charcoal, top-left padding 12pt.
  let cursor = y + 12
  if (body) {
    applyType(doc, "body")
    setTextRgb(doc, CHARCOAL)
    doc.text(body, x + 12, cursor + TYPE.body.size)
    cursor += TYPE.body.lineHeight + BASELINE
  }

  // Dashed signature line — 1pt dash, 2pt gap.
  setDrawRgb(doc, GHOST)
  doc.setLineWidth(1)
  doc.setLineDashPattern([1, 2], 0)
  const lineY = y + blockHeight - 24
  doc.line(x + 12, lineY, x + 12 + SIGNATURE_LINE_LENGTH, lineY)
  doc.setLineDashPattern([], 0) // reset

  // Caption under the line.
  applyType(doc, "caption")
  setTextRgb(doc, SLATE)
  doc.text(caption.toUpperCase(), x + 12, lineY + TYPE.caption.size + 4)

  return y + blockHeight
}

// ── Label primitives (small surfaces) ────────────────────────────────────────

/**
 * Draws the 2pt brand-blue top rule used by the Roll Label per Kimi's
 * spec. Labels skip full chrome; this is the only brand mark on them.
 */
export function drawLabelTopRule(doc: jsPDF, x: number, y: number, width: number): void {
  setFillRgb(doc, BRAND_BLUE)
  doc.rect(x, y, width, LABEL_TOP_RULE, "F")
}

/**
 * Draws the full-width brand-blue header bar used by the public
 * barcode-scan label per Kimi's spec. Renders the white "ARC & ANCHOR"
 * caption centered.
 */
export function drawBarcodeHeaderBar(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  caption = "ARC & ANCHOR"
): void {
  setFillRgb(doc, BRAND_BLUE)
  doc.rect(x, y, width, BARCODE_HEADER_HEIGHT, "F")

  applyType(doc, "caption")
  setTextRgb(doc, WHITE)
  doc.text(caption.toUpperCase(), x + width / 2, y + BARCODE_HEADER_HEIGHT / 2 + 3, {
    align: "center",
  })
}
