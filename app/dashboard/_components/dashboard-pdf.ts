import jsPDF from "jspdf"
import { format } from "date-fns"

import { ARC_ANCHOR_LOGO_BASE64 } from "@/app/dashboard/cutting-engine/_components/arc-anchor-logo"

import type { OperationsExportInput } from "./dashboard-export-utils"

// ── Constants (mirrors cut-history-pdf for brand consistency) ──────────────

type RGB = readonly [number, number, number]

const MARGIN = 15
const PAGE_W = 210
const PAGE_H = 297
const CONTENT_W = PAGE_W - MARGIN * 2

const BRAND: RGB = [37, 99, 235]
const GRAY_900: RGB = [17, 24, 39]
const GRAY_700: RGB = [55, 65, 81]
const GRAY_500: RGB = [107, 114, 128]
const GRAY_200: RGB = [229, 231, 235]
const GRAY_50: RGB = [249, 250, 251]
const WHITE: RGB = [255, 255, 255]

let cachedLogo: string | null = null
function getLogo(): string {
  if (!cachedLogo) {
    cachedLogo = `data:image/jpeg;base64,${ARC_ANCHOR_LOGO_BASE64}`
  }
  return cachedLogo
}

function checkNewPage(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - 20) {
    doc.addPage()
    return 20
  }
  return y
}

/**
 * Truncate `value` with an ellipsis so it fits within `maxWidth` mm at the
 * currently-active font. Width-aware (uses `doc.getTextWidth`) and stable
 * for any font/size. Caller must set `doc.setFont` / `doc.setFontSize`
 * before measuring — that's how jsPDF knows the metrics to use.
 */
function clampText(doc: jsPDF, value: string, maxWidth: number): string {
  if (maxWidth <= 0 || value === "") return value
  if (doc.getTextWidth(value) <= maxWidth) return value
  const ellipsis = "…"
  // Binary search for the longest prefix length whose `prefix + …` fits.
  let lo = 0
  let hi = value.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (doc.getTextWidth(value.slice(0, mid) + ellipsis) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return value.slice(0, lo) + ellipsis
}

// ── Header ─────────────────────────────────────────────────────────────────

function addHeader(doc: jsPDF, input: OperationsExportInput, logo: string): number {
  let y = 15

  doc.addImage(logo, "JPEG", MARGIN, y - 3, 10, 10)
  doc.setFontSize(14)
  doc.setTextColor(...BRAND)
  doc.setFont("helvetica", "bold")
  doc.text("Rubberfit Pro", MARGIN + 13, y + 3)
  y += 13

  doc.setFontSize(20)
  doc.setTextColor(...GRAY_900)
  doc.text("Operations Overview", MARGIN, y)
  y += 8

  doc.setFontSize(10)
  doc.setTextColor(...GRAY_500)
  doc.setFont("helvetica", "normal")
  const periodWord = input.period.charAt(0).toUpperCase() + input.period.slice(1)
  doc.text(
    `${periodWord} · ${input.periodLabel} · generated ${format(new Date(), "MMMM d, yyyy HH:mm")}`,
    MARGIN,
    y
  )
  y += 4

  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y)
  y += 5

  return y
}

// ── Summary Cards ──────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function addSummaryCards(doc: jsPDF, input: OperationsExportInput, y: number): number {
  y = checkNewPage(doc, y, 32)
  const cards = [
    { label: "Active Rolls", value: `${input.totalActiveRolls}` },
    { label: "Cuts This Week", value: `${input.cutsThisWeek}` },
    { label: "Avg Waste", value: `${input.wastePercentage.toFixed(1)}%` },
    { label: "Inventory Value", value: formatCurrency(input.inventoryValue) },
  ]
  const gap = 3
  const cardW = (CONTENT_W - gap * (cards.length - 1)) / cards.length
  const cardH = 22

  for (let i = 0; i < cards.length; i++) {
    const x = MARGIN + i * (cardW + gap)
    doc.setFillColor(...GRAY_50)
    doc.setDrawColor(...GRAY_200)
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD")
    doc.setFontSize(7)
    doc.setTextColor(...GRAY_500)
    doc.setFont("helvetica", "normal")
    doc.text(cards[i].label.toUpperCase(), x + cardW / 2, y + 7.5, { align: "center" })
    doc.setFontSize(14)
    doc.setTextColor(...GRAY_900)
    doc.setFont("helvetica", "bold")
    doc.text(cards[i].value, x + cardW / 2, y + 16, { align: "center" })
  }

  return y + cardH + 8
}

// ── Utilization Table ──────────────────────────────────────────────────────

function addUtilizationTable(doc: jsPDF, input: OperationsExportInput, y: number): number {
  y = checkNewPage(doc, y, 24)

  doc.setFontSize(12)
  doc.setTextColor(...GRAY_900)
  doc.setFont("helvetica", "bold")
  doc.text(`Utilization (${input.utilPeriod}) — sqft by material`, MARGIN, y)
  y += 6

  if (input.utilization.series.length === 0 || input.utilization.materials.length === 0) {
    doc.setFontSize(9)
    doc.setTextColor(...GRAY_500)
    doc.setFont("helvetica", "italic")
    doc.text("No utilization data in this window.", MARGIN, y)
    return y + 8
  }

  const cols = ["Bucket", ...input.utilization.materials]
  const colW = CONTENT_W / cols.length

  const cellPad = 4

  const drawHeader = (headerY: number): number => {
    doc.setFillColor(...BRAND)
    doc.rect(MARGIN, headerY - 3.5, CONTENT_W, 6, "F")
    doc.setFontSize(8)
    doc.setTextColor(...WHITE)
    doc.setFont("helvetica", "bold")
    for (let i = 0; i < cols.length; i++) {
      const cx = MARGIN + i * colW + colW / 2
      doc.text(clampText(doc, cols[i].toUpperCase(), colW - cellPad), cx, headerY, {
        align: "center",
      })
    }
    return headerY + 5
  }

  y = drawHeader(y)

  for (let r = 0; r < input.utilization.series.length; r++) {
    const beforePageCheck = y
    y = checkNewPage(doc, y, 6)
    if (y !== beforePageCheck) y = drawHeader(y)
    // Body font size is re-applied per row so a page-break re-draw of
    // the header (which sets size 8) doesn't leak into the next row.
    doc.setFontSize(9)
    const row = input.utilization.series[r]
    if (r % 2 === 0) {
      doc.setFillColor(...GRAY_50)
      doc.rect(MARGIN, y - 3.5, CONTENT_W, 5.5, "F")
    }
    doc.setTextColor(...GRAY_700)
    doc.setFont("helvetica", "normal")
    doc.text(clampText(doc, String(row.label ?? ""), colW - cellPad), MARGIN + colW / 2, y, {
      align: "center",
    })
    for (let c = 0; c < input.utilization.materials.length; c++) {
      const material = input.utilization.materials[c]
      const cell = row[material]
      const value = typeof cell === "number" ? cell.toFixed(1) : "0.0"
      doc.setTextColor(...GRAY_900)
      doc.setFont("helvetica", "bold")
      doc.text(value, MARGIN + (c + 1) * colW + colW / 2, y, { align: "center" })
    }
    y += 5.5
  }

  return y + 6
}

// ── Recent Cuts Table ──────────────────────────────────────────────────────

function addRecentCutsTable(doc: jsPDF, input: OperationsExportInput, y: number): number {
  y = checkNewPage(doc, y, 24)

  doc.setFontSize(12)
  doc.setTextColor(...GRAY_900)
  doc.setFont("helvetica", "bold")
  doc.text("Recent Cuts", MARGIN, y)
  y += 6

  if (input.recentCuts.length === 0) {
    doc.setFontSize(9)
    doc.setTextColor(...GRAY_500)
    doc.setFont("helvetica", "italic")
    doc.text("No recent cuts.", MARGIN, y)
    return y + 8
  }

  // Column widths: Job | Operator | Util% | When
  const widths = [0.25, 0.35, 0.18, 0.22].map((w) => CONTENT_W * w)
  const headers = ["JOB CODE", "OPERATOR", "UTILIZATION %", "WHEN"]

  const drawHeader = (headerY: number): number => {
    doc.setFillColor(...BRAND)
    doc.rect(MARGIN, headerY - 3.5, CONTENT_W, 6, "F")
    doc.setFontSize(8)
    doc.setTextColor(...WHITE)
    doc.setFont("helvetica", "bold")
    let cx = MARGIN + 3
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], cx, headerY)
      cx += widths[i]
    }
    return headerY + 5
  }

  y = drawHeader(y)

  for (let i = 0; i < input.recentCuts.length; i++) {
    const beforePageCheck = y
    y = checkNewPage(doc, y, 6)
    if (y !== beforePageCheck) y = drawHeader(y)
    // Body font size is re-applied per row so a page-break re-draw of
    // the header (which sets size 8) doesn't leak into the next row.
    doc.setFontSize(9)
    const cut = input.recentCuts[i]
    if (i % 2 === 0) {
      doc.setFillColor(...GRAY_50)
      doc.rect(MARGIN, y - 3.5, CONTENT_W, 5.5, "F")
    }
    let x = MARGIN + 3
    // Reserve 6mm of right padding inside each column so adjacent cells
    // don't touch when the value is near the column edge.
    const cellPad = 6
    doc.setTextColor(...GRAY_900)
    doc.setFont("helvetica", "bold")
    doc.text(clampText(doc, cut.jobCode, widths[0] - cellPad), x, y)
    x += widths[0]
    doc.setTextColor(...GRAY_700)
    doc.setFont("helvetica", "normal")
    doc.text(clampText(doc, cut.operator, widths[1] - cellPad), x, y)
    x += widths[1]
    doc.setTextColor(...GRAY_900)
    doc.setFont("helvetica", "bold")
    doc.text(`${cut.utilizationPct.toFixed(1)}%`, x, y)
    x += widths[2]
    doc.setTextColor(...GRAY_500)
    doc.setFont("helvetica", "normal")
    doc.text(clampText(doc, cut.whenLabel, widths[3] - cellPad), x, y)
    y += 5.5
  }

  return y + 6
}

// ── Footer ─────────────────────────────────────────────────────────────────

function addFooter(doc: jsPDF): void {
  // jsPDF exposes `getNumberOfPages` on the doc instance as the canonical
  // accessor; the `internal.pages.length` shape is undocumented and has
  // shifted between major versions.
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...GRAY_200)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, PAGE_H - 15, MARGIN + CONTENT_W, PAGE_H - 15)
    doc.setFontSize(7)
    doc.setTextColor(...GRAY_500)
    doc.setFont("helvetica", "normal")
    const mainFooter = "Rubberfit Pro — Material Optimization System "
    doc.text(mainFooter, MARGIN, PAGE_H - 10)
    const mainW = doc.getTextWidth(mainFooter)
    doc.setFont("helvetica", "italic")
    doc.text("by Arc and Anchor", MARGIN + mainW, PAGE_H - 10)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.text(`Page ${i} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 10, { align: "right" })
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build the Operations overview PDF as a Blob.
 * Pure jsPDF (no DOM dependency), so it can be unit-tested in happy-dom.
 */
export function buildOperationsPdf(input: OperationsExportInput): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  doc.setProperties({
    title: "Operations Overview",
    subject: "Rubberfit Pro Operations Overview",
    author: "Rubberfit Pro",
    creator: "Rubberfit Pro",
  })

  const logo = getLogo()
  let y = addHeader(doc, input, logo)
  y = addSummaryCards(doc, input, y)
  y = addUtilizationTable(doc, input, y)
  addRecentCutsTable(doc, input, y)
  addFooter(doc)

  return doc.output("blob")
}

/**
 * Trigger a browser download of the Operations overview PDF.
 *
 * Async-shaped (yields one microtask before doing work) so the menu's
 * `isExporting` guard has a real seam — rapid double-clicks during the
 * commit phase see the in-flight flag rather than racing past it.
 */
export async function downloadOperationsPdf(input: OperationsExportInput): Promise<void> {
  await Promise.resolve()
  const blob = buildOperationsPdf(input)
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  try {
    link.href = url
    link.download = `operations-overview_${input.period}_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`
    document.body.appendChild(link)
    link.click()
  } finally {
    // Detach + revoke even if `appendChild`/`click` throws so we don't leak
    // the blob URL. Defer the revoke by one task — Safari and some Chromium
    // versions race the revoke against the actual download fetch when both
    // happen synchronously.
    if (link.isConnected) document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
