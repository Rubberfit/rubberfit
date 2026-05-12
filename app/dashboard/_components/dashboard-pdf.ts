import jsPDF from "jspdf"
import { format } from "date-fns"

import {
  contentStartY,
  drawInternalChrome,
  drawKpiCard,
  drawRuledTable,
  drawSectionDivider,
  ensureSpace,
  INTERNAL_PAGE,
  KPI_GAP,
  KPI_MIN_HEIGHT,
  resetColors,
  SLATE,
  stampFooterOnEveryPage,
  type TableColumn,
  TYPE,
} from "@/app/lib/pdf"

import type { OperationsExportInput } from "./dashboard-export-utils"

/**
 * Operations Overview — internal-canvas snapshot of the dashboard
 * KPIs + utilization table + recent cuts. Phase 7 PR 2: adopts the
 * shared `app/lib/pdf` chrome + primitives. Page geometry moved from
 * A4 millimetres to A4 in points so it matches the rest of the
 * design system; layout math is rebuilt from scratch on the new
 * 595×842pt @ 42pt margin grid.
 *
 * Contracts preserved (operations-overview test pins them):
 *   - `buildOperationsPdf(input): Blob` returns a non-empty PDF
 *   - `downloadOperationsPdf(input)` triggers a browser download
 *     using the same filename pattern (`operations-overview_<period>_<ts>.pdf`)
 */

const PAGE_W = INTERNAL_PAGE.width
const PAGE_MARGIN = INTERNAL_PAGE.margin
const CONTENT_W = INTERNAL_PAGE.contentWidth

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function ensure(doc: jsPDF, y: number, needed: number): number {
  return ensureSpace(doc, {
    cursor: y,
    neededHeight: needed,
    canvas: "internal",
    redrawChrome: (page) => {
      drawInternalChrome(page, {
        title: "OPERATIONS OVERVIEW",
      })
      return contentStartY("internal")
    },
  })
}

// ── Period meta-line under the chrome ───────────────────────────────────────

function drawPeriodMeta(doc: jsPDF, input: OperationsExportInput, y: number): number {
  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
  const period = `${input.periodLabel.toUpperCase()} · ${input.period.toUpperCase()}`
  doc.text(period, PAGE_MARGIN, y)
  return y + TYPE.caption.lineHeight + 8
}

// ── Summary KPI strip ───────────────────────────────────────────────────────

function drawSummaryCards(doc: jsPDF, input: OperationsExportInput, y: number): number {
  y = ensure(doc, y, KPI_MIN_HEIGHT + 24)
  const cards: ReadonlyArray<{ label: string; value: string; unit?: string }> = [
    { label: "Active rolls", value: String(input.totalActiveRolls) },
    { label: "Cuts this week", value: String(input.cutsThisWeek) },
    { label: "Avg waste", value: input.wastePercentage.toFixed(1), unit: "%" },
    { label: "Inventory value", value: formatCurrency(input.inventoryValue) },
  ]
  const cardW = (CONTENT_W - KPI_GAP * (cards.length - 1)) / cards.length

  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i]
    if (!card) continue
    const x = PAGE_MARGIN + i * (cardW + KPI_GAP)
    drawKpiCard(doc, { x, y, width: cardW, label: card.label, value: card.value, unit: card.unit })
  }

  return y + KPI_MIN_HEIGHT + 24
}

// ── Utilization table ───────────────────────────────────────────────────────

function drawUtilizationTable(doc: jsPDF, input: OperationsExportInput, y: number): number {
  y = ensure(doc, y, 80)
  y = drawSectionDivider(doc, {
    x: PAGE_MARGIN,
    y,
    width: CONTENT_W,
    title: `Utilization (${input.utilPeriod}) — sq ft by material`,
  })
  y += 12

  if (input.utilization.series.length === 0 || input.utilization.materials.length === 0) {
    doc.setFont(TYPE.body.family, "italic")
    doc.setFontSize(TYPE.body.size)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    doc.text("No utilization data in this window.", PAGE_MARGIN, y + TYPE.body.size)
    return y + TYPE.body.lineHeight + 16
  }

  const materials = input.utilization.materials
  // Bucket column gets a wider slice; remainder split evenly across material cols.
  const bucketW = 80
  const materialW = (CONTENT_W - bucketW) / materials.length
  // Typed annotation drops the `as const` casts (CR catch). The .map
  // callback also gets an explicit return type so the inner literal
  // narrows without a cast.
  const columns: ReadonlyArray<TableColumn> = [
    { header: "Bucket", width: bucketW },
    ...materials.map(
      (m): TableColumn => ({ header: m, width: materialW, align: "right", mono: true })
    ),
  ]

  const rows = input.utilization.series.map((row) => {
    const cells: string[] = [String(row.label ?? "")]
    for (const m of materials) {
      const cell = row[m]
      cells.push(typeof cell === "number" ? cell.toFixed(1) : "0.0")
    }
    return { cells }
  })

  return drawRuledTable(doc, {
    x: PAGE_MARGIN,
    y,
    columns,
    rows,
    pageBreak: {
      canvas: "internal",
      redrawChrome: (page) => {
        drawInternalChrome(page, { title: "OPERATIONS OVERVIEW" })
        return contentStartY("internal")
      },
    },
  })
}

// ── Recent cuts table ───────────────────────────────────────────────────────

function drawRecentCutsTable(doc: jsPDF, input: OperationsExportInput, y: number): number {
  y = ensure(doc, y, 80)
  y = drawSectionDivider(doc, {
    x: PAGE_MARGIN,
    y,
    width: CONTENT_W,
    title: "Recent cuts",
  })
  y += 12

  if (input.recentCuts.length === 0) {
    doc.setFont(TYPE.body.family, "italic")
    doc.setFontSize(TYPE.body.size)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    doc.text("No recent cuts.", PAGE_MARGIN, y + TYPE.body.size)
    return y + TYPE.body.lineHeight + 16
  }

  // Job | Operator | Util% | When — widths sum to CONTENT_W.
  const columns: ReadonlyArray<TableColumn> = [
    { header: "Job code", width: CONTENT_W * 0.25, mono: true },
    { header: "Operator", width: CONTENT_W * 0.35 },
    { header: "Utilization", width: CONTENT_W * 0.18, align: "right", mono: true },
    { header: "When", width: CONTENT_W * 0.22, align: "right" },
  ]

  const rows = input.recentCuts.map((cut) => ({
    cells: [cut.jobCode, cut.operator, `${cut.utilizationPct.toFixed(1)}%`, cut.whenLabel],
  }))

  return drawRuledTable(doc, {
    x: PAGE_MARGIN,
    y,
    columns,
    rows,
    pageBreak: {
      canvas: "internal",
      redrawChrome: (page) => {
        drawInternalChrome(page, { title: "OPERATIONS OVERVIEW" })
        return contentStartY("internal")
      },
    },
  })
}

// ── Public API ──────────────────────────────────────────────────────────────

export function buildOperationsPdf(input: OperationsExportInput): Blob {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [PAGE_W, INTERNAL_PAGE.height],
  })

  doc.setProperties({
    title: "Operations Overview",
    subject: "Rubberfit Operations Overview",
    author: "Rubberfit",
    creator: "Rubberfit",
  })

  drawInternalChrome(doc, {
    title: "OPERATIONS OVERVIEW",
  })
  resetColors(doc)

  let y = contentStartY("internal")
  y = drawPeriodMeta(doc, input, y)
  y = drawSummaryCards(doc, input, y)
  y = drawUtilizationTable(doc, input, y)
  y += 16
  drawRecentCutsTable(doc, input, y)

  const ts = format(new Date(), "yyyy-MM-dd HH:mm")
  stampFooterOnEveryPage(doc, "internal", () => `Operations · ${input.period} · ${ts}`)

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
