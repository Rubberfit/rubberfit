import { format } from "date-fns"
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
  drawSignatureBlock,
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
import { ARC_ANCHOR_LOGO_BASE64 } from "@/app/dashboard/cutting-engine/_components/arc-anchor-logo"
import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"

import type { POExportFilters, POExportSummary, PurchaseOrdersExportInput } from "./po-export-utils"

/**
 * Purchase Order PDF — Phase 7 PR 4.
 *
 * Replaces the legacy HTML/iframe stamper (`po-pdf-export.ts`) and the
 * generic `exportPdfService.generatePDFReport(html)` filtered-list path
 * with imperative jsPDF builders that compose the shared
 * `app/lib/pdf` chrome + primitives. Customer canvas (Letter
 * 612×792pt @ 48pt margin) keeps POs visually consistent with the
 * Job Sheet for supplier-facing documents.
 *
 * Public builders preserved by name where possible:
 *   - `buildSinglePoPdf(po)` — single-PO doc (used by the row-action
 *     Download PDF in `use-po-columns.tsx`).
 *   - `buildPurchaseOrdersListPdf(input)` — filtered list, each PO
 *     rendered as one section + page break between (multi-PO export
 *     from the table's Export menu).
 *   - `downloadSinglePoPdf`, `downloadPurchaseOrdersListPdf` — the
 *     thin save wrappers.
 */

const PAGE_MARGIN = CUSTOMER_PAGE.margin
const CONTENT_W = CUSTOMER_PAGE.contentWidth

const LOGO_DATA_URL = `data:image/jpeg;base64,${ARC_ANCHOR_LOGO_BASE64}`

const STATUS_INTENT: Readonly<Record<string, ChipIntent>> = {
  draft: "info",
  pending: "warning",
  approved: "info",
  ordered: "warning",
  received: "success",
  cancelled: "error",
}

function intentForStatus(status: string | null | undefined): ChipIntent {
  if (!status) return "info"
  return STATUS_INTENT[status.toLowerCase()] ?? "info"
}

function formatStatus(status: string | null | undefined): string {
  if (!status) return "Pending"
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  // YYYY-MM-DD dates parsed as UTC midnight would shift backward by
  // one day in US time zones — append local-time guard.
  const isoLocal = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const date = new Date(isoLocal)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "$0.00"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

function activeFilterLabel(filters: POExportFilters): string {
  const parts: string[] = []
  if (filters.status && filters.status !== "all") parts.push(`status=${filters.status}`)
  if (filters.supplier && filters.supplier !== "all") parts.push(`supplier=${filters.supplier}`)
  if (filters.search) parts.push(`search="${filters.search}"`)
  return parts.length === 0 ? "none" : parts.join(", ")
}

// ── Page-break helper bound to the customer canvas ──────────────────────────

function ensure(doc: jsPDF, y: number, needed: number, title: string): number {
  return ensureSpace(doc, {
    cursor: y,
    neededHeight: needed,
    canvas: "customer",
    redrawChrome: (page) => {
      drawCustomerChrome(page, { title, logoDataUrl: LOGO_DATA_URL })
      return contentStartY("customer")
    },
  })
}

// ── Single-PO rendering ─────────────────────────────────────────────────────

/**
 * Renders one PO into the current page of `doc`, starting at `y`.
 * Returns the Y cursor just below the last drawn element. Used by
 * both the single-PO builder and the multi-PO list builder.
 */
function renderPo(doc: jsPDF, po: PurchaseOrderWithDetails, y: number, title: string): number {
  // PO number + status chip + supplier identity block.
  doc.setFont(TYPE.h1.family, TYPE.h1.weight)
  doc.setFontSize(TYPE.h1.size)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(`PO #${po.po_number ?? "—"}`, PAGE_MARGIN, y + TYPE.h1.size)
  const chipY = y + 4
  drawStatusChip(doc, {
    x: PAGE_MARGIN + 200,
    y: chipY,
    label: formatStatus(po.status),
    intent: intentForStatus(po.status),
  })
  y += TYPE.h1.lineHeight + 8

  // Supplier + meta — two columns of label/value pairs.
  const colGap = 24
  const colW = (CONTENT_W - colGap) / 2

  doc.setFillColor(SURFACE[0], SURFACE[1], SURFACE[2])
  doc.rect(PAGE_MARGIN, y, colW, 96, "F")
  doc.rect(PAGE_MARGIN + colW + colGap, y, colW, 96, "F")

  drawAddressBlock(doc, "SUPPLIER", PAGE_MARGIN, y, colW, [
    po.supplier?.name ?? "—",
    po.supplier?.email ?? "",
    po.supplier?.phone ?? "",
    po.supplier?.payment_terms ? `Terms: ${po.supplier.payment_terms}` : "",
  ])
  drawAddressBlock(doc, "SHIP TO", PAGE_MARGIN + colW + colGap, y, colW, [
    po.shipping_address ?? "Default warehouse address",
    "",
    `Order date: ${formatDate(po.order_date)}`,
    `Requested: ${formatDate(po.requested_delivery_date)}`,
  ])
  y += 96 + 24

  // Line items — ruled table with pagination.
  const itemColumns: ReadonlyArray<TableColumn> = [
    { header: "#", width: 28, align: "right", mono: true },
    { header: "Description", width: 260 },
    { header: "Qty (sq ft)", width: 80, align: "right", mono: true },
    { header: "Unit cost", width: 70, align: "right", mono: true },
    { header: "Total", width: 78, align: "right", mono: true },
  ]
  const items = po.items ?? []
  const itemRows = items.map((item, index) => {
    const descBits: string[] = [item.description ?? "—"]
    if (item.width !== null && item.width !== undefined) descBits.push(`${item.width}" wide`)
    if (item.thickness !== null && item.thickness !== undefined)
      descBits.push(`${item.thickness}" thick`)
    if (item.color) descBits.push(item.color)
    const qty = item.quantity_sqft ?? 0
    const cost = item.unit_cost ?? 0
    return {
      cells: [
        String(index + 1),
        descBits.join(" · "),
        qty.toFixed(2),
        formatMoney(cost),
        formatMoney(qty * cost),
      ],
    }
  })

  y = drawSectionDivider(doc, {
    x: PAGE_MARGIN,
    y,
    width: CONTENT_W,
    title: "Line items",
  })
  y += 12

  if (itemRows.length === 0) {
    doc.setFont(TYPE.body.family, "italic")
    doc.setFontSize(TYPE.body.size)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    doc.text("No items on this PO.", PAGE_MARGIN, y + TYPE.body.size)
    y += TYPE.body.lineHeight + 16
  } else {
    y =
      drawRuledTable(doc, {
        x: PAGE_MARGIN,
        y,
        columns: itemColumns,
        rows: itemRows,
        pageBreak: {
          canvas: "customer",
          redrawChrome: (page) => {
            drawCustomerChrome(page, { title, logoDataUrl: LOGO_DATA_URL })
            return contentStartY("customer")
          },
        },
      }) + 16
  }

  // Totals — right-aligned label/value rows.
  y = ensure(doc, y, 80, title)
  const totalsX = PAGE_MARGIN + CONTENT_W - 220
  const totalsRows: ReadonlyArray<readonly [string, string, boolean]> = [
    ["Subtotal", formatMoney(po.subtotal), false],
    ["Tax", formatMoney(po.tax_amount), false],
    ["Shipping", formatMoney(po.shipping_cost), false],
    ["Total", formatMoney(po.total_amount), true],
  ]
  for (const [label, value, isTotal] of totalsRows) {
    doc.setFont(TYPE.body.family, isTotal ? "bold" : "normal")
    doc.setFontSize(isTotal ? TYPE.h2.size : TYPE.body.size)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    doc.text(label, totalsX, y)
    doc.setTextColor(INK[0], INK[1], INK[2])
    doc.text(value, totalsX + 220, y, { align: "right" })
    y += isTotal ? TYPE.h2.lineHeight : TYPE.body.lineHeight
  }
  y += 12

  // Optional notes.
  if (po.notes) {
    y = drawSectionDivider(doc, {
      x: PAGE_MARGIN,
      y,
      width: CONTENT_W,
      title: "Notes",
    })
    y += 12
    doc.setFont(TYPE.body.family, TYPE.body.weight)
    doc.setFontSize(TYPE.body.size)
    doc.setTextColor(CHARCOAL[0], CHARCOAL[1], CHARCOAL[2])
    const lines = doc.splitTextToSize(po.notes, CONTENT_W)
    for (const line of lines) {
      y += TYPE.body.lineHeight
      doc.text(line, PAGE_MARGIN, y)
    }
    y += 16
  }

  // Signature block.
  y = ensure(doc, y, 80, title)
  drawSignatureBlock(doc, {
    x: PAGE_MARGIN,
    y,
    width: 320,
    body: "Approved on behalf of the buyer.",
    caption: "AUTHORIZED SIGNATURE",
  })
  return y + 80
}

function drawAddressBlock(
  doc: jsPDF,
  eyebrow: string,
  x: number,
  y: number,
  width: number,
  lines: ReadonlyArray<string>
): void {
  const innerX = x + 16
  // Eyebrow caption in brand-blue.
  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2])
  doc.text(eyebrow, innerX, y + 16)

  // Lines: first as h2 (name), rest as body.
  let cursor = y + 30
  let isFirst = true
  for (const line of lines) {
    if (!line) continue
    if (isFirst) {
      doc.setFont(TYPE.h2.family, TYPE.h2.weight)
      doc.setFontSize(TYPE.h2.size)
      doc.setTextColor(INK[0], INK[1], INK[2])
      doc.text(line, innerX, cursor)
      cursor += TYPE.h2.lineHeight
      isFirst = false
    } else {
      doc.setFont(TYPE.body.family, TYPE.body.weight)
      doc.setFontSize(TYPE.body.size)
      doc.setTextColor(CHARCOAL[0], CHARCOAL[1], CHARCOAL[2])
      doc.text(line, innerX, cursor)
      cursor += TYPE.body.lineHeight
    }
    if (cursor > y + width) return
  }
}

// ── Single-PO builder + downloader ──────────────────────────────────────────

export function buildSinglePoPdf(po: PurchaseOrderWithDetails): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: [CUSTOMER_PAGE.width, CUSTOMER_PAGE.height] })
  const title = "PURCHASE ORDER"

  doc.setProperties({
    title: `Purchase Order ${po.po_number ?? ""}`.trim(),
    subject: po.supplier?.name ?? "",
    author: "Rubberfit",
    creator: "Rubberfit",
  })

  drawCustomerChrome(doc, {
    title,
    subtitle: po.po_number ?? undefined,
    logoDataUrl: LOGO_DATA_URL,
  })
  resetColors(doc)

  // Single-PO doc: render once at the content top and let the table /
  // signature block paginate via `pageBreak`. Return value of
  // `renderPo` discarded — single-PO has no follow-on content.
  renderPo(doc, po, contentStartY("customer"), title)

  const ts = format(new Date(), "yyyy-MM-dd HH:mm")
  stampFooterOnEveryPage(doc, "customer", () => `PO ${po.po_number ?? ""} • ${ts}`)
  return doc
}

export function downloadSinglePoPdf(po: PurchaseOrderWithDetails): void {
  const doc = buildSinglePoPdf(po)
  const safe = (po.po_number ?? "po").replace(/[^A-Za-z0-9._-]/g, "_")
  doc.save(`PO-${safe}.pdf`)
}

// ── Filtered-list builder (one PO per section + page break) ─────────────────

export function buildPurchaseOrdersListPdf(input: PurchaseOrdersExportInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: [CUSTOMER_PAGE.width, CUSTOMER_PAGE.height] })
  const title = "PURCHASE ORDERS"

  doc.setProperties({
    title: "Purchase Orders",
    subject: "Rubberfit Purchase Orders export",
    author: "Rubberfit",
    creator: "Rubberfit",
  })

  drawCustomerChrome(doc, { title, logoDataUrl: LOGO_DATA_URL })
  resetColors(doc)

  let y = contentStartY("customer")

  // Filter + generation meta line.
  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
  const generatedAt = format(new Date(), "MMM d, yyyy HH:mm")
  doc.text(
    `Filters: ${activeFilterLabel(input.filters).toUpperCase()} · GENERATED ${generatedAt.toUpperCase()}`,
    PAGE_MARGIN,
    y
  )
  y += TYPE.caption.lineHeight + 16

  // Summary KPI strip (6 cards).
  const cards = buildSummaryCards(input.stats)
  const cardW = (CONTENT_W - KPI_GAP * (cards.length - 1)) / cards.length
  for (let i = 0; i < cards.length; i += 1) {
    const c = cards[i]
    if (!c) continue
    drawKpiCard(doc, {
      x: PAGE_MARGIN + i * (cardW + KPI_GAP),
      y,
      width: cardW,
      label: c.label,
      value: c.value,
    })
  }
  y += KPI_MIN_HEIGHT + 24

  if (input.pos.length === 0) {
    y = drawSectionDivider(doc, { x: PAGE_MARGIN, y, width: CONTENT_W, title: "Orders" })
    y += 12
    doc.setFont(TYPE.body.family, "italic")
    doc.setFontSize(TYPE.body.size)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    doc.text("No purchase orders match the current filters.", PAGE_MARGIN, y + TYPE.body.size)
  } else {
    // One PO per page section. Page break between to keep each PO
    // standalone for forwarding to a supplier.
    for (let i = 0; i < input.pos.length; i += 1) {
      const po = input.pos[i]
      if (!po) continue
      if (i > 0) {
        doc.addPage()
        drawCustomerChrome(doc, { title, logoDataUrl: LOGO_DATA_URL })
        y = contentStartY("customer")
      }
      y = renderPo(doc, po, y, title)
    }
  }

  const ts = format(new Date(), "yyyy-MM-dd HH:mm")
  stampFooterOnEveryPage(doc, "customer", () => `Purchase orders · ${ts}`)
  return doc
}

function buildSummaryCards(
  stats: POExportSummary
): ReadonlyArray<{ label: string; value: string }> {
  return [
    { label: "Total POs", value: String(stats.total) },
    { label: "Total value", value: formatMoney(stats.totalValue) },
    { label: "Draft", value: String(stats.draft) },
    { label: "Pending", value: String(stats.pending) },
    { label: "In transit", value: String(stats.ordered) },
    { label: "Received", value: String(stats.received) },
  ]
}

export async function downloadPurchaseOrdersListPdf(
  input: PurchaseOrdersExportInput
): Promise<void> {
  // Microtask yield matches the dashboard download API so the menu's
  // in-flight guard has a real seam.
  await Promise.resolve()
  const doc = buildPurchaseOrdersListPdf(input)
  const ts = format(new Date(), "yyyy-MM-dd_HHmm")
  doc.save(`purchase-orders_${ts}.pdf`)
}
