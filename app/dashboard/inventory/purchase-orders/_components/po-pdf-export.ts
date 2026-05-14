import { type PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"
import type { UserDatePreferencesInput } from "@/src/application/preferences/user-date-format"

import { downloadSinglePoPdf } from "./po-pdf"

/**
 * Phase 7 PR 4 — thin wrapper that delegates to the new imperative
 * jsPDF builder in `po-pdf.ts`. Kept as `handleDownloadPDF` so the
 * existing row-action callers (`use-po-columns.tsx`,
 * `purchase-orders/page.tsx`) don't need to change shape. The
 * preferences argument is optional so callers without preferences
 * context still get a sensible default-formatted PDF.
 */
export function handleDownloadPDF(
  po: PurchaseOrderWithDetails,
  preferences?: UserDatePreferencesInput
): void {
  downloadSinglePoPdf(po, preferences)
}
