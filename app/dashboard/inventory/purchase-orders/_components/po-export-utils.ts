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

// Phase 7 PR 4 — `escapeHtml` + `activeFilterLabel` lived here only to
// feed `buildPurchaseOrdersPdfHtml`, which is gone. Removed alongside
// the HTML stamper path. CSV cell-injection sanitizer stays.

/**
 * Neutralize CSV formula injection. Excel/Google Sheets evaluate cells
 * starting with `=`, `+`, `-`, `@` as formulas, and treat leading `\t`
 * or `\r` as paste/cell-break sentinels. Excel also trims leading
 * whitespace before evaluating the formula chars, so `"  =SUM(A1:A2)"`
 * is just as dangerous as `"=SUM(A1:A2)"`. Prefix a single quote to
 * keep the original text visible while preventing execution. Mirrors
 * the dashboard sanitizer in `dashboard-export-utils.ts`.
 */
function sanitizeCsvCell(value: string): string {
  if (value === "") return value
  // Tab and carriage return are sentinels in their own right — `trimStart`
  // would strip them before the regex check, so handle them up front.
  if (/^[\t\r]/.test(value)) return `'${value}`
  const trimmed = value.trimStart()
  return /^[=+\-@]/.test(trimmed) ? `'${value}` : value
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

// Phase 7 PR 4 — the HTML-stamper builder that used to live here is
// gone. Filtered-list PDF generation now lives in `po-pdf.ts` and
// returns a `jsPDF` instance built with the shared customer-canvas
// chrome. Re-export for consumers that imported from this module.
export { buildPurchaseOrdersListPdf, downloadPurchaseOrdersListPdf } from "./po-pdf"
