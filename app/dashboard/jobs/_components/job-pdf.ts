import { jsPDF } from "jspdf"

import type { JobFullDetail, JobStatus } from "@/src/infrastructure/models/supabase"
import { ARC_ANCHOR_LOGO_BASE64 } from "@/app/dashboard/cutting-engine/_components/arc-anchor-logo"

/**
 * Customer-facing Job Sheet PDF — the project confirmation document a
 * manufacturer hands their customer once a cut job is scoped. Editorial-
 * commercial direction: generous whitespace, left-edge brand stripes on
 * each section, KPI card trio for totals, fine-ruled tables with brand-
 * tinted zebra rows.
 *
 * **Does NOT include cut layouts, nesting diagrams, or offcut visuals** —
 * that is the internal cut history's job (`cut-history-pdf.ts`). Layouts
 * never appear in customer-facing deliverables.
 */

export interface BuildJobPdfOptions {
  companyName?: string
}

// ── Design Tokens ────────────────────────────────────────────────────────────
// Shares the Arc & Anchor palette with cut-history-pdf.ts so both documents
// feel like siblings. Units are PDF points (pt) — US Letter is 612 × 792pt.

type RGB = readonly [number, number, number]

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 48
const CONTENT_W = PAGE_W - MARGIN * 2

const BRAND: RGB = [37, 99, 235]
const BRAND_50: RGB = [239, 246, 255]
const GRAY_900: RGB = [17, 24, 39]
const GRAY_700: RGB = [55, 65, 81]
const GRAY_500: RGB = [107, 114, 128]
const GRAY_300: RGB = [209, 213, 219]
const GRAY_200: RGB = [229, 231, 235]
const GRAY_100: RGB = [243, 244, 246]
const GRAY_50: RGB = [249, 250, 251]
const WHITE: RGB = [255, 255, 255]

// Status chip palette (background, text)
const STATUS_COLORS: Record<JobStatus, { bg: RGB; fg: RGB }> = {
  draft: { bg: [243, 244, 246], fg: [55, 65, 81] },
  scheduled: { bg: [239, 246, 255], fg: [30, 64, 175] },
  in_progress: { bg: [255, 247, 237], fg: [154, 52, 18] },
  completed: { bg: [236, 253, 245], fg: [6, 95, 70] },
  cancelled: { bg: [254, 242, 242], fg: [153, 27, 27] },
}

// ── Logo Loader ──────────────────────────────────────────────────────────────

let cachedLogo: string | null = null

function getLogo(): string {
  if (!cachedLogo) cachedLogo = `data:image/jpeg;base64,${ARC_ANCHOR_LOGO_BASE64}`
  return cachedLogo
}

// ── Formatters ───────────────────────────────────────────────────────────────

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

function formatStatus(status: JobStatus): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatSqft(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

// ── Page Break Helper ────────────────────────────────────────────────────────

function checkNewPage(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - 60) {
    doc.addPage()
    return MARGIN
  }
  return y
}

// ── Section Stripe (left-edge brand bar + heading) ───────────────────────────

function drawSectionHeader(doc: jsPDF, label: string, y: number): number {
  doc.setFillColor(...BRAND)
  doc.rect(MARGIN, y - 9, 3, 12, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...GRAY_900)
  doc.text(label, MARGIN + 10, y)
  return y + 14
}

// ── Header Band ──────────────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, job: JobFullDetail, company: string): number {
  const y0 = MARGIN

  // Logo + company
  doc.addImage(getLogo(), "JPEG", MARGIN, y0, 28, 28)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...BRAND)
  doc.text(company, MARGIN + 36, y0 + 12)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...GRAY_500)
  doc.text("Job Sheet", MARGIN + 36, y0 + 23)

  // Right side: Job number chip
  const chipLabel = job.job_number ?? "—"
  const chipPadX = 10
  const chipH = 22
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  const chipTextW = doc.getTextWidth(chipLabel)
  const chipW = chipTextW + chipPadX * 2
  const chipX = PAGE_W - MARGIN - chipW
  doc.setFillColor(...GRAY_900)
  doc.roundedRect(chipX, y0, chipW, chipH, 4, 4, "F")
  doc.setTextColor(...WHITE)
  doc.text(chipLabel, chipX + chipPadX, y0 + 15)

  // Small caption above the chip
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(...GRAY_500)
  doc.text("JOB NUMBER", PAGE_W - MARGIN, y0 + 32, { align: "right" })

  // Hairline under header
  const ruleY = y0 + 44
  doc.setDrawColor(...GRAY_200)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, ruleY, PAGE_W - MARGIN, ruleY)

  // Job title + description
  let y = ruleY + 24
  doc.setFont("helvetica", "bold")
  doc.setFontSize(22)
  doc.setTextColor(...GRAY_900)
  const titleLines = doc.splitTextToSize(job.name, CONTENT_W)
  doc.text(titleLines[0], MARGIN, y)
  y += 22

  if (job.description) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(...GRAY_500)
    const descLines = doc.splitTextToSize(job.description, CONTENT_W)
    const clipped = descLines.slice(0, 3)
    doc.text(clipped, MARGIN, y)
    y += clipped.length * 13
  }

  return y + 16
}

// ── Two-Column Info Block (Customer | Project Meta) ──────────────────────────

function drawInfoColumns(doc: jsPDF, job: JobFullDetail, y: number): number {
  const colGap = 16
  const colW = (CONTENT_W - colGap) / 2
  const leftX = MARGIN
  const rightX = MARGIN + colW + colGap

  // Subtle panels behind each column
  const panelH = 108
  doc.setFillColor(...GRAY_50)
  doc.roundedRect(leftX, y, colW, panelH, 6, 6, "F")
  doc.roundedRect(rightX, y, colW, panelH, 6, 6, "F")

  // Left: Customer
  drawColumnHeader(doc, "BILL TO", leftX + 16, y + 20)
  let lyL = y + 38
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...GRAY_900)
  doc.text(job.customer_name ?? "—", leftX + 16, lyL)
  lyL += 14
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...GRAY_700)
  if (job.customer_email) {
    doc.text(job.customer_email, leftX + 16, lyL)
    lyL += 12
  }
  if (job.customer_phone) {
    doc.text(job.customer_phone, leftX + 16, lyL)
    lyL += 12
  }
  if (job.customer_po_number) {
    doc.setTextColor(...GRAY_500)
    doc.text("PO", leftX + 16, lyL)
    doc.setTextColor(...GRAY_900)
    doc.setFont("helvetica", "bold")
    doc.text(job.customer_po_number, leftX + 36, lyL)
  }

  // Right: Project meta
  drawColumnHeader(doc, "PROJECT DETAILS", rightX + 16, y + 20)

  // Status chip on its own row
  const statusColor = STATUS_COLORS[job.status]
  const statusLabel = formatStatus(job.status)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  const statusTextW = doc.getTextWidth(statusLabel)
  const statusW = statusTextW + 16
  const statusY = y + 32
  doc.setFillColor(...statusColor.bg)
  doc.roundedRect(rightX + 16, statusY, statusW, 14, 7, 7, "F")
  doc.setTextColor(...statusColor.fg)
  doc.text(statusLabel, rightX + 16 + statusW / 2, statusY + 9, { align: "center" })

  // Meta rows
  const metaRows: Array<[string, string]> = [
    ["Due date", formatDate(job.due_date)],
    ["Created", formatDate(job.created_at)],
    ["Completed", formatDate(job.completed_at)],
  ]
  let lyR = statusY + 26
  doc.setFontSize(9)
  for (const [label, value] of metaRows) {
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...GRAY_500)
    doc.text(label, rightX + 16, lyR)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...GRAY_900)
    doc.text(value, rightX + colW - 16, lyR, { align: "right" })
    lyR += 13
  }

  return y + panelH + 20
}

function drawColumnHeader(doc: jsPDF, label: string, x: number, y: number): void {
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.setTextColor(...BRAND)
  doc.text(label, x, y)
}

// ── Roster ───────────────────────────────────────────────────────────────────

function drawRoster(doc: jsPDF, job: JobFullDetail, y: number): number {
  y = checkNewPage(doc, y, 50)
  y = drawSectionHeader(doc, "Roster", y)

  const lead = job.assignees.find((a) => a.role === "lead")
  const workers = job.assignees.filter((a) => a.role === "worker")

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...GRAY_500)
  doc.text("Lead", MARGIN, y)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...GRAY_900)
  doc.text(lead?.name ?? "—", MARGIN + 80, y)
  y += 16

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...GRAY_500)
  doc.text("Workers", MARGIN, y)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...GRAY_900)
  const names = workers.length > 0 ? workers.map((w) => w.name).join(", ") : "—"
  const nameLines = doc.splitTextToSize(names, CONTENT_W - 80)
  doc.text(nameLines, MARGIN + 80, y)
  y += nameLines.length * 13

  return y + 18
}

// ── Parts Table ──────────────────────────────────────────────────────────────

interface PartsTotals {
  totalSqft: number
  totalValue: number
  partsCount: number
}

function drawPartsTable(
  doc: jsPDF,
  job: JobFullDetail,
  y: number
): { y: number; totals: PartsTotals } {
  y = checkNewPage(doc, y, 80)
  y = drawSectionHeader(doc, "Parts", y)

  const cols = {
    part: MARGIN + 4,
    material: MARGIN + 90,
    dims: MARGIN + 210,
    qty: MARGIN + 360,
    sqft: MARGIN + 420,
    price: PAGE_W - MARGIN - 4,
  }

  // Header row
  const headerH = 22
  doc.setFillColor(...GRAY_900)
  doc.rect(MARGIN, y, CONTENT_W, headerH, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(...WHITE)
  const th = y + 14
  doc.text("PART #", cols.part, th)
  doc.text("MATERIAL", cols.material, th)
  doc.text("DIMENSIONS", cols.dims, th)
  doc.text("QTY", cols.qty, th, { align: "right" })
  doc.text("SQ FT", cols.sqft, th, { align: "right" })
  doc.text("UNIT PRICE", cols.price, th, { align: "right" })
  y += headerH

  // Rows
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)

  const rowH = 22
  const totals: PartsTotals = { totalSqft: 0, totalValue: 0, partsCount: 0 }

  if (job.parts.length === 0) {
    doc.setFillColor(...WHITE)
    doc.rect(MARGIN, y, CONTENT_W, rowH, "F")
    doc.setTextColor(...GRAY_500)
    doc.setFont("helvetica", "italic")
    doc.text("No parts recorded for this job.", MARGIN + CONTENT_W / 2, y + 14, { align: "center" })
    y += rowH
  } else {
    for (let i = 0; i < job.parts.length; i++) {
      y = checkNewPage(doc, y, rowH + 4)
      const p = job.parts[i]
      const sqft = (p.width * p.length * p.quantity) / 144
      totals.totalSqft += sqft
      totals.partsCount += p.quantity
      if (p.unit_price !== null && p.unit_price !== undefined) {
        totals.totalValue += p.unit_price * p.quantity
      }

      // Zebra stripe
      if (i % 2 === 1) {
        doc.setFillColor(...GRAY_50)
        doc.rect(MARGIN, y, CONTENT_W, rowH, "F")
      }

      const ty = y + 14
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...GRAY_900)
      doc.text(p.part_number ?? "—", cols.part, ty)

      doc.setFont("helvetica", "normal")
      doc.setTextColor(...GRAY_700)
      doc.text(truncate(doc, p.material_type ?? "—", 110), cols.material, ty)

      const dims = `${p.width}" × ${p.length}"${p.thickness ? ` × ${p.thickness}"` : ""}`
      doc.text(dims, cols.dims, ty)

      doc.setTextColor(...GRAY_900)
      doc.setFont("helvetica", "bold")
      doc.text(String(p.quantity), cols.qty, ty, { align: "right" })
      doc.text(formatSqft(sqft), cols.sqft, ty, { align: "right" })
      doc.setFont("helvetica", "normal")
      doc.text(formatCurrency(p.unit_price), cols.price, ty, { align: "right" })

      y += rowH
    }
  }

  // Hairline under last row
  doc.setDrawColor(...GRAY_200)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 16

  return { y, totals }
}

function truncate(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text
  let t = text
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) {
    t = t.slice(0, -1)
  }
  return `${t}…`
}

// ── Totals KPI Trio ──────────────────────────────────────────────────────────

function drawTotalsKpi(doc: jsPDF, totals: PartsTotals, y: number): number {
  y = checkNewPage(doc, y, 72)
  const gap = 12
  const cardW = (CONTENT_W - gap * 2) / 3
  const cardH = 64

  const cards: Array<{ label: string; value: string; accent: boolean }> = [
    { label: "PIECES", value: String(totals.partsCount), accent: false },
    { label: "TOTAL AREA", value: `${formatSqft(totals.totalSqft)} sq ft`, accent: false },
    {
      label: "TOTAL VALUE",
      value: totals.totalValue > 0 ? formatCurrency(totals.totalValue) : "—",
      accent: true,
    },
  ]

  for (let i = 0; i < cards.length; i++) {
    const x = MARGIN + i * (cardW + gap)
    const card = cards[i]

    if (card.accent) {
      doc.setFillColor(...BRAND)
      doc.roundedRect(x, y, cardW, cardH, 6, 6, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7)
      doc.setTextColor(...BRAND_50)
      doc.text(card.label, x + 16, y + 20)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(22)
      doc.setTextColor(...WHITE)
      doc.text(card.value, x + 16, y + 48)
    } else {
      doc.setFillColor(...WHITE)
      doc.setDrawColor(...GRAY_200)
      doc.setLineWidth(0.6)
      doc.roundedRect(x, y, cardW, cardH, 6, 6, "FD")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7)
      doc.setTextColor(...GRAY_500)
      doc.text(card.label, x + 16, y + 20)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(22)
      doc.setTextColor(...GRAY_900)
      doc.text(card.value, x + 16, y + 48)
    }
  }

  return y + cardH + 24
}

// ── Allocations Table ────────────────────────────────────────────────────────

function drawAllocationsTable(doc: jsPDF, job: JobFullDetail, y: number): number {
  if (job.allocations.length === 0) return y
  y = checkNewPage(doc, y, 80)
  y = drawSectionHeader(doc, "Allocated Rolls", y)

  const cols = {
    part: MARGIN + 4,
    material: MARGIN + 110,
    allocated: MARGIN + 250,
    location: PAGE_W - MARGIN - 4,
  }

  // Header row
  const headerH = 22
  doc.setFillColor(...GRAY_100)
  doc.rect(MARGIN, y, CONTENT_W, headerH, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(...GRAY_700)
  const th = y + 14
  doc.text("PART #", cols.part, th)
  doc.text("MATERIAL", cols.material, th)
  doc.text("ALLOCATED", cols.allocated, th)
  doc.text("LOCATION", cols.location, th, { align: "right" })
  y += headerH

  const rowH = 20
  for (let i = 0; i < job.allocations.length; i++) {
    y = checkNewPage(doc, y, rowH + 4)
    const a = job.allocations[i]
    const roll = a.roll
    const sqft = roll ? (a.allocated_length * roll.width) / 144 : 0

    if (i % 2 === 1) {
      doc.setFillColor(...GRAY_50)
      doc.rect(MARGIN, y, CONTENT_W, rowH, "F")
    }

    const ty = y + 13
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...GRAY_900)
    doc.text(roll?.part_number ?? "—", cols.part, ty)

    doc.setFont("helvetica", "normal")
    doc.setTextColor(...GRAY_700)
    doc.text(truncate(doc, roll?.material_type ?? "—", 130), cols.material, ty)

    doc.setTextColor(...GRAY_900)
    doc.text(`${a.allocated_length}″  `, cols.allocated, ty)
    doc.setTextColor(...GRAY_500)
    doc.text(`(${formatSqft(sqft)} sq ft)`, cols.allocated + 40, ty)

    doc.setTextColor(...GRAY_700)
    doc.text(truncate(doc, roll?.location ?? "—", 120), cols.location, ty, { align: "right" })

    y += rowH
  }

  doc.setDrawColor(...GRAY_200)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)

  return y + 16
}

// ── Footer (every page) ──────────────────────────────────────────────────────

function drawFooter(doc: jsPDF, company: string, jobNumber: string): void {
  // jsPDF v2 exposes an internal pages array; length includes a leading blank.
  const totalPages = doc.getNumberOfPages()
  const ts = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    const fy = PAGE_H - 32
    doc.setDrawColor(...GRAY_200)
    doc.setLineWidth(0.4)
    doc.line(MARGIN, fy, PAGE_W - MARGIN, fy)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...GRAY_500)
    doc.text(`Generated ${ts}`, MARGIN, fy + 14)

    if (totalPages > 1) {
      doc.text(`Page ${i} of ${totalPages}`, PAGE_W / 2, fy + 14, { align: "center" })
    }

    doc.setFont("helvetica", "bold")
    doc.setTextColor(...GRAY_700)
    doc.text(`${company} · ${jobNumber}`, PAGE_W - MARGIN, fy + 14, { align: "right" })
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function buildJobPdf(job: JobFullDetail, opts: BuildJobPdfOptions = {}): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" })
  const company = opts.companyName ?? "Rubberfit"

  doc.setProperties({
    title: `Job Sheet ${job.job_number ?? ""}`.trim(),
    subject: job.name,
    author: company,
    creator: company,
  })

  let y = drawHeader(doc, job, company)
  y = drawInfoColumns(doc, job, y)
  y = drawRoster(doc, job, y)
  const { y: afterParts, totals } = drawPartsTable(doc, job, y)
  y = afterParts
  y = drawTotalsKpi(doc, totals, y)
  drawAllocationsTable(doc, job, y)
  drawFooter(doc, company, job.job_number ?? "—")

  return doc
}

export function downloadJobPdf(job: JobFullDetail, opts: BuildJobPdfOptions = {}): void {
  const doc = buildJobPdf(job, opts)
  doc.save(jobPdfFileName(job))
}

/** Base file name used for both local downloads and bucket uploads. */
export function jobPdfFileName(job: JobFullDetail): string {
  const jobRef = job.job_number ?? job.id
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
