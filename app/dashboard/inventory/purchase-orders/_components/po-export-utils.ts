import { format } from "date-fns"

import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"
import type { ExportData } from "@/src/application/services/export.service.interface"

export interface POExportFilters {
  status: string
  supplier: string
  search: string
}

export interface POExportSummary {
  total: number
  totalValue: number
  draft: number
  pending: number
  ordered: number
  received: number
}

export interface PurchaseOrdersExportInput {
  pos: PurchaseOrderWithDetails[]
  filters: POExportFilters
  stats: POExportSummary
}

/** Snapshot the bits of `usePurchaseOrders` the export menu needs. */
export function toPurchaseOrdersExportInput(po: {
  filteredPOs: PurchaseOrderWithDetails[]
  statusFilter: string
  supplierFilter: string
  searchQuery: string
  stats: POExportSummary
}): PurchaseOrdersExportInput {
  return {
    pos: po.filteredPOs,
    filters: {
      status: po.statusFilter,
      supplier: po.supplierFilter,
      search: po.searchQuery,
    },
    stats: po.stats,
  }
}

const FILENAME = "purchase-orders"

function formatDate(value?: string | null): string {
  if (!value) return ""
  // ISO timestamps stored as midnight UTC would shift across the day line
  // when run through local-time `format`. Treat anything starting with a
  // YYYY-MM-DD prefix as already-bucketed and pass it through verbatim.
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  return format(parsed, "yyyy-MM-dd")
}

function formatMoney(value: number | null | undefined): string {
  // Supabase returns numeric columns as `number`, but a partially loaded PO
  // (e.g., from a deep-linked row that hasn't refetched yet) can carry
  // null totals. Coerce to 0.00 instead of throwing on `null.toFixed`.
  if (value == null || !Number.isFinite(value)) return "0.00"
  return value.toFixed(2)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Neutralize CSV formula injection: cells starting with `= + - @ \t \r`
 * are evaluated as formulas by Excel/Google Sheets. Prefixing with a
 * single quote keeps the original text visible while preventing
 * execution.
 */
function sanitizeCsvCell(value: string): string {
  if (value === "") return value
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function activeFilterLabel(filters: POExportFilters): string {
  const parts: string[] = []
  if (filters.status && filters.status !== "all") parts.push(`status=${filters.status}`)
  if (filters.supplier && filters.supplier !== "all") parts.push(`supplier=${filters.supplier}`)
  if (filters.search) parts.push(`search="${filters.search}"`)
  return parts.length === 0 ? "none" : parts.join(", ")
}

export function buildPurchaseOrdersCsv(input: PurchaseOrdersExportInput): ExportData {
  const headers = [
    "PO Number",
    "Supplier",
    "Status",
    "Order Date",
    "Requested Delivery",
    "Actual Delivery",
    "Items",
    "Subtotal",
    "Tax",
    "Shipping",
    "Total",
    "Notes",
  ]

  const rows: ExportData["rows"] = input.pos.map((po) => [
    sanitizeCsvCell(po.po_number),
    sanitizeCsvCell(po.supplier?.name ?? ""),
    sanitizeCsvCell(po.status),
    sanitizeCsvCell(formatDate(po.order_date)),
    sanitizeCsvCell(formatDate(po.requested_delivery_date)),
    sanitizeCsvCell(formatDate(po.actual_delivery_date)),
    po.items_count ?? po.items?.length ?? 0,
    formatMoney(po.subtotal),
    formatMoney(po.tax_amount),
    formatMoney(po.shipping_cost),
    formatMoney(po.total_amount),
    sanitizeCsvCell(po.notes ?? ""),
  ])

  return { headers, rows, filename: FILENAME }
}

export function buildPurchaseOrdersPdfHtml(input: PurchaseOrdersExportInput): {
  title: string
  content: string
} {
  const generatedAt = format(new Date(), "MMM d, yyyy")
  const filterLabel = activeFilterLabel(input.filters)

  const tableBody =
    input.pos.length === 0
      ? `<tr><td colspan="6">No purchase orders match the current filters.</td></tr>`
      : input.pos
          .map(
            (po) => `
            <tr>
              <td>${escapeHtml(po.po_number)}</td>
              <td>${escapeHtml(po.supplier?.name ?? "")}</td>
              <td>${escapeHtml(po.status)}</td>
              <td>${formatDate(po.order_date)}</td>
              <td>${po.items_count ?? po.items?.length ?? 0}</td>
              <td>$${formatMoney(po.total_amount)}</td>
            </tr>
          `
          )
          .join("")

  const content = `
    <h1>Purchase Orders</h1>
    <p>Filters: ${escapeHtml(filterLabel)} · generated ${generatedAt}</p>

    <h2>Summary</h2>
    <div>
      <div class="metric-card">
        <div class="metric-value">${input.stats.total}</div>
        <div class="metric-label">Total POs</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">$${formatMoney(input.stats.totalValue)}</div>
        <div class="metric-label">Total Value</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${input.stats.draft}</div>
        <div class="metric-label">Draft</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${input.stats.pending}</div>
        <div class="metric-label">Pending</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${input.stats.ordered}</div>
        <div class="metric-label">In Transit</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${input.stats.received}</div>
        <div class="metric-label">Received</div>
      </div>
    </div>

    <h2>Orders (${input.pos.length})</h2>
    <table>
      <thead>
        <tr>
          <th>PO #</th>
          <th>Supplier</th>
          <th>Status</th>
          <th>Order Date</th>
          <th>Items</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${tableBody}
      </tbody>
    </table>
  `

  return { title: "Purchase Orders", content }
}
