import { format } from "date-fns"
import { jsPDF } from "jspdf"

import {
  SIGNAL,
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
import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"
import {
  formatInUserTimeZone,
  formatUserDate,
  type UserDatePreferencesInput,
} from "@/src/application/preferences/user-date-format"

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

function formatDate(
  value: string | null | undefined,
  organizationPreferences?: UserDatePreferencesInput
): string {
  if (!value) return "—"
  // The helper handles YYYY-MM-DD calendar-date stability + invalid
  // input internally; an empty return falls through to the "—"
  // placeholder so the layout doesn't get a blank cell.
  return formatUserDate(value, organizationPreferences) || "—"
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

/**
 * Compact "you are still on PO #X" strip painted at the top of every
 * continuation page. Without it a multi-page PO loses identity after
 * the first break — operators / suppliers see line-items / signature
 * blocks with no header context. Returns the Y cursor where content
 * can resume.
 */
function drawPoContinuationStrip(doc: jsPDF, po: PurchaseOrderWithDetails, y: number): number {
  // Caption-sized "Continued · PO #X" + small status chip, right-aligned.
  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
  const label = `CONTINUED · PO #${po.po_number ?? "—"}`
  doc.text(label, PAGE_MARGIN, y)
  const labelWidth = doc.getTextWidth(label)
  drawStatusChip(doc, {
    x: PAGE_MARGIN + labelWidth + 12,
    y: y - 10,
    label: formatStatus(po.status),
    intent: intentForStatus(po.status),
  })
  return y + TYPE.caption.lineHeight + 12
}

/**
 * `ensure` wrapper that knows about the active PO so continuation
 * pages get the identity strip. Falls back to plain chrome redraw
 * when no PO is in scope (e.g., the list-view summary page).
 */
function ensure(
  doc: jsPDF,
  y: number,
  needed: number,
  title: string,
  po?: PurchaseOrderWithDetails
): number {
  return ensureSpace(doc, {
    cursor: y,
    neededHeight: needed,
    canvas: "customer",
    redrawChrome: (page) => {
      drawCustomerChrome(page, { title })
      const baseY = contentStartY("customer")
      return po ? drawPoContinuationStrip(page, po, baseY) : baseY
    },
  })
}

// ── Single-PO rendering ─────────────────────────────────────────────────────

/**
 * Renders one PO into the current page of `doc`, starting at `y`.
 * Returns the Y cursor just below the last drawn element. Used by
 * both the single-PO builder and the multi-PO list builder.
 */
function renderPo(
  doc: jsPDF,
  po: PurchaseOrderWithDetails,
  y: number,
  title: string,
  organizationPreferences?: UserDatePreferencesInput
): number {
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
  const panelH = 96

  doc.setFillColor(SURFACE[0], SURFACE[1], SURFACE[2])
  doc.rect(PAGE_MARGIN, y, colW, panelH, "F")
  doc.rect(PAGE_MARGIN + colW + colGap, y, colW, panelH, "F")

  drawAddressBlock(doc, "SUPPLIER", PAGE_MARGIN, y, colW, panelH, [
    po.supplier?.name ?? "—",
    po.supplier?.email ?? "",
    po.supplier?.phone ?? "",
    po.supplier?.payment_terms ? `Terms: ${po.supplier.payment_terms}` : "",
  ])
  drawAddressBlock(doc, "SHIP TO", PAGE_MARGIN + colW + colGap, y, colW, panelH, [
    po.shipping_address ?? "Default warehouse address",
    "",
    `Order date: ${formatDate(po.order_date, organizationPreferences)}`,
    `Requested: ${formatDate(po.requested_delivery_date, organizationPreferences)}`,
  ])
  y += panelH + 24

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
            drawCustomerChrome(page, { title })
            // Continuation strip so spillover pages still identify
            // which PO the rows belong to.
            return drawPoContinuationStrip(page, po, contentStartY("customer"))
          },
        },
      }) + 16
  }

  // Totals — right-aligned label/value rows.
  y = ensure(doc, y, 80, title, po)
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
      // CR catch — paginate per line so a long supplier note never
      // bleeds into the footer band. `ensure` redraws chrome on a
      // new page if the next line would overflow.
      y = ensure(doc, y, TYPE.body.lineHeight, title, po)
      y += TYPE.body.lineHeight
      doc.text(line, PAGE_MARGIN, y)
    }
    y += 16
  }

  // Signature block.
  y = ensure(doc, y, 80, title, po)
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
  height: number,
  lines: ReadonlyArray<string>
): void {
  const innerX = x + 16
  // Width budget — 16pt inset on each side, leave 4pt right padding so
  // wrapped text never kisses the panel's right edge.
  const textMaxW = width - 32 - 4

  // Eyebrow caption in signal orange.
  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(SIGNAL[0], SIGNAL[1], SIGNAL[2])
  doc.text(eyebrow, innerX, y + 16)

  // Lines: first as h2 (name), rest as body. Each value gets
  // `splitTextToSize` so long supplier names, emails, or shipping
  // addresses wrap inside the panel instead of bleeding into the
  // opposite column (CR catch).
  let cursor = y + 30
  let isFirst = true
  const bottomLimit = y + height
  for (const line of lines) {
    if (!line) continue
    const role = isFirst ? "h2" : "body"
    const roleSpec = TYPE[role]
    doc.setFont(roleSpec.family, roleSpec.weight)
    doc.setFontSize(roleSpec.size)
    doc.setTextColor(
      ...(isFirst
        ? ([INK[0], INK[1], INK[2]] as const)
        : ([CHARCOAL[0], CHARCOAL[1], CHARCOAL[2]] as const))
    )
    const wrapped = doc.splitTextToSize(line, textMaxW)
    for (const wrappedLine of wrapped) {
      if (cursor > bottomLimit) return
      doc.text(wrappedLine, innerX, cursor)
      cursor += roleSpec.lineHeight
    }
    isFirst = false
  }
}

// ── Single-PO builder + downloader ──────────────────────────────────────────

export function buildSinglePoPdf(
  po: PurchaseOrderWithDetails,
  organizationPreferences?: UserDatePreferencesInput
): jsPDF {
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
  })
  resetColors(doc)

  // Single-PO doc: render once at the content top and let the table /
  // signature block paginate via `pageBreak`. Return value of
  // `renderPo` discarded — single-PO has no follow-on content.
  renderPo(doc, po, contentStartY("customer"), title, organizationPreferences)

  // Compact `<date> <HH:mm>` form keeps the footer single-line under
  // long PO numbers + es-MX locale + long zone abbreviations where a
  // full `formatUserDateTime` (with zone name) could clip the margin.
  const ts = footerTimestamp(organizationPreferences)
  stampFooterOnEveryPage(doc, "customer", () => `PO ${po.po_number ?? ""} • ${ts}`)
  return doc
}

/**
 * Compact `<date> <HH:mm>` timestamp for the PDF footer / "generated"
 * line. Exported so layout tests can build the same string the
 * production code passes to `stampFooterOnEveryPage` without rendering
 * the full blob.
 */
export function footerTimestamp(organizationPreferences?: UserDatePreferencesInput): string {
  const now = new Date()
  return `${formatUserDate(now, organizationPreferences)} ${formatInUserTimeZone(
    now,
    organizationPreferences,
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  )}`
}

export function downloadSinglePoPdf(
  po: PurchaseOrderWithDetails,
  organizationPreferences?: UserDatePreferencesInput
): void {
  const doc = buildSinglePoPdf(po, organizationPreferences)
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

  drawCustomerChrome(doc, { title })
  resetColors(doc)

  let y = contentStartY("customer")

  // Filter + generation meta line.
  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
  const generatedAt = footerTimestamp(input.organizationPreferences)
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
        drawCustomerChrome(doc, { title })
        y = contentStartY("customer")
      }
      y = renderPo(doc, po, y, title, input.organizationPreferences)
    }
  }

  // Reuse the same `generatedAt` snapshot from the header so the
  // footer can't drift past it on long exports — without this, both
  // calls re-evaluate `new Date()` and the header/footer can disagree
  // by a few seconds for big PO lists.
  stampFooterOnEveryPage(doc, "customer", () => `Purchase orders · ${generatedAt}`)
  return doc
}

interface SummaryCard {
  readonly label: string
  readonly value: string
}

function buildSummaryCards(stats: POExportSummary): ReadonlyArray<SummaryCard> {
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
