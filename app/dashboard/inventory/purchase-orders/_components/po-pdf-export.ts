import { type PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"

import { downloadSinglePoPdf } from "./po-pdf"

/**
 * Phase 7 PR 4 — thin wrapper that delegates to the new imperative
 * jsPDF builder in `po-pdf.ts`. Kept as `handleDownloadPDF` so the
 * existing row-action callers (`use-po-columns.tsx`,
 * `purchase-orders/page.tsx`) don't need to change. The previous
 * implementation built a print iframe of inline HTML; the new path
 * produces a styled PDF using the shared customer-canvas chrome.
 */
export function handleDownloadPDF(po: PurchaseOrderWithDetails): void {
  downloadSinglePoPdf(po)
}
