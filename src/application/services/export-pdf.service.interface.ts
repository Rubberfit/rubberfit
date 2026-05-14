import type { UserDatePreferencesInput } from "@/src/application/preferences/user-date-format"

/**
 * Legacy generic HTML→PDF stamper. Most new PDFs build directly with
 * jsPDF; this interface remains for the inventory-summary export
 * still wired in `app/dashboard/inventory/page.tsx`.
 *
 * The optional `organizationPreferences` arg drives the visible
 * "Generated:" stamp + waste-report period dates per the
 * operator-seeds-prints ruling. Filename ISO timestamps stay machine-
 * stable for spreadsheet sortability — they are NOT routed through
 * the helper.
 */
export interface IExportPdfService {
  generatePDFReport(
    title: string,
    content: string,
    organizationPreferences?: UserDatePreferencesInput
  ): Promise<void>
  fallbackPDFDownload(
    title: string,
    htmlContent: string,
    organizationPreferences?: UserDatePreferencesInput
  ): void
  generateInventoryReport(
    rolls: Record<string, unknown>[],
    summary: Record<string, unknown>,
    organizationPreferences?: UserDatePreferencesInput
  ): Promise<void>
  generateWasteReport(
    data: Record<string, unknown>,
    charts?: string,
    organizationPreferences?: UserDatePreferencesInput
  ): Promise<void>
}
