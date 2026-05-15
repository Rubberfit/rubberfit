import { type PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"
import type { UserDatePreferencesInput } from "@/src/application/preferences/user-date-format"

import { downloadSinglePoPdf } from "./po-pdf"

/**
 * Phase 7 PR 4 — thin wrapper that delegates to the new imperative
 * jsPDF builder in `po-pdf.ts`. Kept as `handleDownloadPDF` so the
 * existing row-action callers (`use-po-columns.tsx`,
 * `purchase-orders/page.tsx`) don't need to change shape.
 *
 * Per the 2026-05-14 operator-seeds-prints ruling, the prefs source
 * is the workspace's (org-level), not the viewer's per-user prefs —
 * the PDF download must speak in the operator's voice regardless of
 * who clicks the action. Required to compile-force every caller to
 * wire org prefs explicitly; a missing data-flow path lights up at
 * compile time instead of silently rendering with helper defaults.
 */
export function handleDownloadPDF(
  po: PurchaseOrderWithDetails,
  organizationPreferences: UserDatePreferencesInput
): void {
  downloadSinglePoPdf(po, organizationPreferences)
}
