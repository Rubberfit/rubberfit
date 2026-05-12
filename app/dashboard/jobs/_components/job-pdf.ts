import { jsPDF } from "jspdf"

import {
  BRAND_BLUE,
  CHARCOAL,
  type ChipIntent,
  contentStartY,
  CUSTOMER_PAGE,
  drawCustomerChrome,
  drawKpiCard,
  drawRuledTable,
  drawSectionDivider,
  drawStatusChip,
  ensureSpace,
  INK,
  KPI_GAP,
  KPI_MIN_HEIGHT,
  resetColors,
  SLATE,
  stampFooterOnEveryPage,
  SURFACE,
  type TableColumn,
  TYPE,
} from "@/app/lib/pdf"
import type { JobFullDetail, JobStatus } from "@/src/infrastructure/models/supabase"
import { ARC_ANCHOR_LOGO_BASE64 } from "@/app/dashboard/cutting-engine/_components/arc-anchor-logo"

/**
 * Customer-facing Job Sheet PDF — the project confirmation document a
 * manufacturer hands their customer once a cut job is scoped.
 *
 * **Does NOT include cut layouts, nesting diagrams, or offcut visuals** —
 * that is the internal cut history's job (`cut-history-pdf.ts`). Layouts
 * never appear in customer-facing deliverables.
 *
 * Phase 7 PR 2 — adopts the shared `app/lib/pdf` chrome + primitives so
 * this document reads as a sibling of the Purchase Order, Analytics
 * Report, and Dashboard Export. Per-PDF design choices that survive the
 * refactor: two-column Bill To / Project Details block under the
 * chrome, KPI trio for totals, parts + allocations as ruled tables.
 */

export interface BuildJobPdfOptions {
  /** Company name shown in the footer. Defaults to "Rubberfit". */
  readonly companyName?: string
}

const PAGE_MARGIN = CUSTOMER_PAGE.margin
const CONTENT_W = CUSTOMER_PAGE.contentWidth
const COLUMN_GAP = 16
const COLUMN_W = (CONTENT_W - COLUMN_GAP) / 2

// ── Logo + formatters ───────────────────────────────────────────────────────

// Immutable data URL — built once per module load, no mutable cache.
// CR catch: prior `let cachedLogo` was mutable singleton state.
const LOGO_DATA_URL = `data:image/jpeg;base64,${ARC_ANCHOR_LOGO_BASE64}`

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  // YYYY-MM-DD strings parsed by `new Date(value)` are interpreted as
  // UTC midnight, which shifts the calendar day backward in negative
  // UTC offsets (US time zones). Appending `T00:00:00` forces local
  // interpretation so a job created on the 15th never prints as the
  // 14th in San Francisco. CR catch.
  const isoLocal = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const date = new Date(isoLocal)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

function formatStatus(status: JobStatus): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatSqft(value: number): string {
  return value >= 100
    ? Math.round(value).toLocaleString("en-US")
    : value.toFixed(1).replace(/\.0$/, "")
}

function truncate(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text
  let t = text
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

/**
 * Status chip palette — maps the domain's `JobStatus` union onto the
 * shared `ChipIntent` palette in `app/lib/pdf/tokens.ts`. Centralizing
 * the mapping (vs. duplicating in every consumer) keeps the visual
 * vocabulary consistent across the eight PDFs.
 */
const STATUS_INTENT: Readonly<Record<JobStatus, ChipIntent>> = {
  draft: "info",
  scheduled: "info",
  in_progress: "warning",
  completed: "success",
  cancelled: "error",
}

// ── Page-break helper bound to this document ────────────────────────────────

function ensure(doc: jsPDF, y: number, needed: number): number {
  return ensureSpace(doc, {
    cursor: y,
    neededHeight: needed,
    canvas: "customer",
    redrawChrome: (page) => {
      drawCustomerChrome(page, {
        title: "JOB SHEET",
        logoDataUrl: LOGO_DATA_URL,
      })
      return contentStartY("customer")
    },
  })
}

// ── Page intro block (job title + description, just under the chrome) ───────

function drawJobIntro(doc: jsPDF, job: JobFullDetail, y: number): number {
  // Job number and "JOB SHEET" title both live in the chrome — here we
  // surface the human-readable job name + description so the customer
  // gets the project context immediately.
  doc.setFont(TYPE.h1.family, TYPE.h1.weight)
  doc.setFontSize(TYPE.h1.size)
  doc.setTextColor(INK[0], INK[1], INK[2])
  // Render every wrapped title line, not just the first. CR catch —
  // the previous one-line render truncated long job names AND the
  // description block started too high because the cursor advanced
  // as if the title were single-line.
  const titleLines = doc.splitTextToSize(job.name, CONTENT_W)
  let cursor = y
  for (const line of titleLines) {
    cursor += TYPE.h1.lineHeight
    doc.text(line, PAGE_MARGIN, cursor)
  }
  cursor += 4

  if (job.description) {
    doc.setFont(TYPE.body.family, TYPE.body.weight)
    doc.setFontSize(TYPE.body.size)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    const descLines = doc.splitTextToSize(job.description, CONTENT_W)
    const clipped = descLines.slice(0, 3)
    for (const line of clipped) {
      cursor += TYPE.body.lineHeight
      doc.text(line, PAGE_MARGIN, cursor)
    }
  }

  return cursor + 16
}

// ── Bill To + Project Details two-column block ──────────────────────────────

function drawCustomerColumn(doc: jsPDF, job: JobFullDetail, x: number, y: number): number {
  const innerX = x + 16
  const headerY = y + 16

  // Eyebrow (caption + brand-blue, ALL CAPS)
  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2])
  doc.text("BILL TO", innerX, headerY)

  // Customer name (h2)
  let cursor = headerY + 18
  doc.setFont(TYPE.h2.family, TYPE.h2.weight)
  doc.setFontSize(TYPE.h2.size)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(job.customer_name ?? "—", innerX, cursor)
  cursor += 16

  doc.setFont(TYPE.body.family, TYPE.body.weight)
  doc.setFontSize(TYPE.body.size)
  doc.setTextColor(CHARCOAL[0], CHARCOAL[1], CHARCOAL[2])
  if (job.customer_email) {
    doc.text(job.customer_email, innerX, cursor)
    cursor += TYPE.body.lineHeight
  }
  if (job.customer_phone) {
    doc.text(job.customer_phone, innerX, cursor)
    cursor += TYPE.body.lineHeight
  }
  if (job.customer_po_number) {
    doc.setFont(TYPE.caption.family, TYPE.caption.weight)
    doc.setFontSize(TYPE.caption.size)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    doc.text("PO REF", innerX, cursor + 4)
    doc.setFont(TYPE.body.family, "bold")
    doc.setFontSize(TYPE.body.size)
    doc.setTextColor(INK[0], INK[1], INK[2])
    doc.text(job.customer_po_number, innerX + 60, cursor + 4)
    cursor += TYPE.body.lineHeight + 4
  }

  return cursor
}

function drawProjectColumn(doc: jsPDF, job: JobFullDetail, x: number, y: number): number {
  const innerX = x + 16
  const headerY = y + 16

  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2])
  doc.text("PROJECT DETAILS", innerX, headerY)

  // Status chip — maps JobStatus → ChipIntent and uses the shared primitive.
  const statusY = headerY + 12
  drawStatusChip(doc, {
    x: innerX,
    y: statusY,
    label: formatStatus(job.status),
    intent: STATUS_INTENT[job.status],
  })

  // Date rows — label left, value right.
  const rows: ReadonlyArray<readonly [string, string]> = [
    ["Due date", formatDate(job.due_date)],
    ["Created", formatDate(job.created_at)],
    ["Completed", formatDate(job.completed_at)],
  ]
  let cursor = statusY + 32
  doc.setFontSize(TYPE.body.size)
  for (const [label, value] of rows) {
    doc.setFont(TYPE.body.family, TYPE.body.weight)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    doc.text(label, innerX, cursor)
    doc.setFont(TYPE.body.family, "bold")
    doc.setTextColor(INK[0], INK[1], INK[2])
    doc.text(value, x + COLUMN_W - 16, cursor, { align: "right" })
    cursor += TYPE.body.lineHeight
  }

  return cursor
}

function drawInfoColumns(doc: jsPDF, job: JobFullDetail, y: number): number {
  const panelH = 132
  y = ensure(doc, y, panelH + 24)

  // Surface-fill panels (rectangles per Kimi spec — no rounded corners).
  doc.setFillColor(SURFACE[0], SURFACE[1], SURFACE[2])
  doc.rect(PAGE_MARGIN, y, COLUMN_W, panelH, "F")
  doc.rect(PAGE_MARGIN + COLUMN_W + COLUMN_GAP, y, COLUMN_W, panelH, "F")

  drawCustomerColumn(doc, job, PAGE_MARGIN, y)
  drawProjectColumn(doc, job, PAGE_MARGIN + COLUMN_W + COLUMN_GAP, y)

  return y + panelH + 24
}

// ── Roster ──────────────────────────────────────────────────────────────────

function drawRoster(doc: jsPDF, job: JobFullDetail, y: number): number {
  // Pre-compute the worker name wrap so the page-break check below
  // knows the real height. CR catch — the prior `ensure(doc, y, 80)`
  // was a static estimate that would overflow when a large roster
  // wrapped to many lines.
  const lead = job.assignees.find((a) => a.role === "lead")
  const workers = job.assignees.filter((a) => a.role === "worker")
  const names = workers.length > 0 ? workers.map((w) => w.name).join(", ") : "—"
  doc.setFont(TYPE.body.family, TYPE.body.weight)
  doc.setFontSize(TYPE.body.size)
  const nameLines = doc.splitTextToSize(names, CONTENT_W - 80)
  // Divider + 12pt gap + lead line + worker lines + 16pt trailing gap.
  const neededHeight =
    TYPE.h2.lineHeight + 12 + TYPE.body.lineHeight + nameLines.length * TYPE.body.lineHeight + 16

  y = ensure(doc, y, neededHeight)
  y = drawSectionDivider(doc, {
    x: PAGE_MARGIN,
    y,
    width: CONTENT_W,
    title: "Roster",
  })
  y += 12

  doc.setFont(TYPE.body.family, TYPE.body.weight)
  doc.setFontSize(TYPE.body.size)
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
  doc.text("Lead", PAGE_MARGIN, y)
  doc.setFont(TYPE.body.family, "bold")
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(lead?.name ?? "—", PAGE_MARGIN + 80, y)
  y += TYPE.body.lineHeight

  doc.setFont(TYPE.body.family, TYPE.body.weight)
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
  doc.text("Workers", PAGE_MARGIN, y)
  doc.setFont(TYPE.body.family, "bold")
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(nameLines, PAGE_MARGIN + 80, y)
  y += nameLines.length * TYPE.body.lineHeight

  return y + 16
}

// ── Parts table + totals ────────────────────────────────────────────────────

interface PartsTotals {
  totalSqft: number
  totalValue: number
  partsCount: number
  /**
   * True iff at least one part carries an explicit `unit_price`. Lets
   * the totals KPI distinguish "no pricing entered" (render "—") from
   * a legitimate $0 total on a free/sample job. CR catch — prior
   * `totalValue > 0` check collapsed valid zeros into the dash.
   */
  hasPricing: boolean
}

function drawPartsTable(
  doc: jsPDF,
  job: JobFullDetail,
  y: number
): { y: number; totals: PartsTotals } {
  y = ensure(doc, y, 100)
  y = drawSectionDivider(doc, {
    x: PAGE_MARGIN,
    y,
    width: CONTENT_W,
    title: "Parts",
  })
  y += 12

  const totals: PartsTotals = {
    totalSqft: 0,
    totalValue: 0,
    partsCount: 0,
    hasPricing: false,
  }

  if (job.parts.length === 0) {
    doc.setFont(TYPE.body.family, "italic")
    doc.setFontSize(TYPE.body.size)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    doc.text("No parts recorded for this job.", PAGE_MARGIN, y + TYPE.body.size)
    return { y: y + TYPE.body.lineHeight + 16, totals }
  }

  // Pre-compute totals so the table call has the right values.
  for (const p of job.parts) {
    const sqft = (p.width * p.length * p.quantity) / 144
    totals.totalSqft += sqft
    totals.partsCount += p.quantity
    if (p.unit_price !== null && p.unit_price !== undefined) {
      totals.hasPricing = true
      totals.totalValue += p.unit_price * p.quantity
    }
  }

  // Column widths sum to CONTENT_W = 516pt. Typed annotation drops
  // the per-row `as const` casts (CR catch — no-cast rule applies to
  // table column literals too; the union narrows via the annotation).
  const columns: ReadonlyArray<TableColumn> = [
    { header: "Part #", width: 90 },
    { header: "Material", width: 140 },
    { header: "Dimensions", width: 116 },
    { header: "Qty", width: 50, align: "right", mono: true },
    { header: "Sq ft", width: 60, align: "right", mono: true },
    { header: "Unit price", width: 60, align: "right", mono: true },
  ]

  const rows = job.parts.map((p) => {
    const sqft = (p.width * p.length * p.quantity) / 144
    const dims = `${p.width}" × ${p.length}"${p.thickness ? ` × ${p.thickness}"` : ""}`
    return {
      cells: [
        p.part_number ?? "—",
        truncate(doc, p.material_type ?? "—", 130),
        dims,
        String(p.quantity),
        formatSqft(sqft),
        formatCurrency(p.unit_price),
      ],
    }
  })

  const finalY = drawRuledTable(doc, {
    x: PAGE_MARGIN,
    y,
    columns,
    rows,
    pageBreak: {
      canvas: "customer",
      redrawChrome: (page) => {
        drawCustomerChrome(page, { title: "JOB SHEET", logoDataUrl: LOGO_DATA_URL })
        return contentStartY("customer")
      },
    },
  })

  return { y: finalY + 24, totals }
}

function drawTotalsKpi(doc: jsPDF, totals: PartsTotals, y: number): number {
  y = ensure(doc, y, KPI_MIN_HEIGHT + 24)
  const cardW = (CONTENT_W - KPI_GAP * 2) / 3
  const cards: ReadonlyArray<{ label: string; value: string; unit?: string }> = [
    { label: "Pieces", value: String(totals.partsCount) },
    { label: "Total area", value: formatSqft(totals.totalSqft), unit: "SQ FT" },
    {
      label: "Total value",
      // hasPricing distinguishes "no prices on file" (render "—") from
      // a legitimate $0 on free/sample jobs.
      value: totals.hasPricing ? formatCurrency(totals.totalValue) : "—",
    },
  ]

  for (let i = 0; i < cards.length; i += 1) {
    const x = PAGE_MARGIN + i * (cardW + KPI_GAP)
    const card = cards[i]
    if (!card) continue
    drawKpiCard(doc, { x, y, width: cardW, label: card.label, value: card.value, unit: card.unit })
  }

  return y + KPI_MIN_HEIGHT + 24
}

// ── Allocations table ───────────────────────────────────────────────────────

function drawAllocationsTable(doc: jsPDF, job: JobFullDetail, y: number): number {
  if (job.allocations.length === 0) return y
  y = ensure(doc, y, 100)
  y = drawSectionDivider(doc, {
    x: PAGE_MARGIN,
    y,
    width: CONTENT_W,
    title: "Allocated rolls",
  })
  y += 12

  const columns: ReadonlyArray<TableColumn> = [
    { header: "Part #", width: 110 },
    { header: "Material", width: 160 },
    { header: "Allocated", width: 130, align: "right", mono: true },
    { header: "Location", width: 116, align: "right" },
  ]

  const rows = job.allocations.map((a) => {
    const roll = a.roll
    const sqft = roll ? (a.allocated_length * roll.width) / 144 : 0
    return {
      cells: [
        roll?.part_number ?? "—",
        truncate(doc, roll?.material_type ?? "—", 150),
        `${a.allocated_length}″  (${formatSqft(sqft)} sq ft)`,
        truncate(doc, roll?.location ?? "—", 110),
      ],
    }
  })

  return drawRuledTable(doc, {
    x: PAGE_MARGIN,
    y,
    columns,
    rows,
    pageBreak: {
      canvas: "customer",
      redrawChrome: (page) => {
        drawCustomerChrome(page, { title: "JOB SHEET", logoDataUrl: LOGO_DATA_URL })
        return contentStartY("customer")
      },
    },
  })
}

// ── Main ────────────────────────────────────────────────────────────────────

export function buildJobPdf(job: JobFullDetail, opts: BuildJobPdfOptions = {}): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: [CUSTOMER_PAGE.width, CUSTOMER_PAGE.height] })
  const company = opts.companyName ?? "Rubberfit"

  doc.setProperties({
    title: `Job Sheet ${job.job_number ?? ""}`.trim(),
    subject: job.name,
    author: company,
    creator: company,
  })

  drawCustomerChrome(doc, {
    title: "JOB SHEET",
    subtitle: job.job_number ?? undefined,
    logoDataUrl: LOGO_DATA_URL,
  })
  resetColors(doc)

  let y = contentStartY("customer")
  y = drawJobIntro(doc, job, y)
  y = drawInfoColumns(doc, job, y)
  y = drawRoster(doc, job, y)
  const { y: afterParts, totals } = drawPartsTable(doc, job, y)
  y = afterParts
  y = drawTotalsKpi(doc, totals, y)
  drawAllocationsTable(doc, job, y)

  // Stamp footer on EVERY page in a final pass so "n of N" lands
  // correctly even if the content paginated mid-table.
  const ts = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
  const ref = job.job_number ?? "—"
  stampFooterOnEveryPage(doc, "customer", () => `${ref} • ${ts}`, company)

  return doc
}

export function downloadJobPdf(job: JobFullDetail, opts: BuildJobPdfOptions = {}): void {
  const doc = buildJobPdf(job, opts)
  doc.save(jobPdfFileName(job))
}

/** Base file name used for both local downloads and bucket uploads. */
export function jobPdfFileName(job: JobFullDetail): string {
  // `||` (not `??`) so an empty-string job_number falls back to the
  // id — schema says job_number is always present, but the
  // pre-trigger legacy rows in prod have empty strings. Without this
  // the filename degrades to a bare `.pdf` for those rows.
  const jobRef = job.job_number || job.id
  const customer = job.customer_name ? `_${job.customer_name.replace(/[^A-Za-z0-9]+/g, "-")}` : ""
  return `${jobRef}${customer}.pdf`
}

/**
 * Blob output of the job PDF — for uploading to storage and
 * sharing via signed URL rather than a forced download.
 */
export function buildJobPdfBlob(job: JobFullDetail, opts: BuildJobPdfOptions = {}): Blob {
  return buildJobPdf(job, opts).output("blob")
}
