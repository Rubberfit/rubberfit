export interface IExportPdfService {
  generatePDFReport(title: string, content: string): Promise<void>
  fallbackPDFDownload(title: string, htmlContent: string): void
  generateInventoryReport(
    rolls: Record<string, unknown>[],
    summary: Record<string, unknown>
  ): Promise<void>
  generateWasteReport(data: Record<string, unknown>, charts?: string): Promise<void>
}
