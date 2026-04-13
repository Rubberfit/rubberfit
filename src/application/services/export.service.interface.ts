export interface ExportData {
  headers: string[]
  rows: (string | number | boolean | null | undefined)[][]
  filename?: string
}

export interface IExportService {
  exportToCSV(data: ExportData): void
  exportInventory(rolls: Record<string, unknown>[]): void
  exportCutHistory(cuts: Record<string, unknown>[]): void
  exportWasteAnalysis(data: Record<string, unknown>[]): void
  exportMaterialUsage(data: Record<string, unknown>[]): void
  generatePDFReport(title: string, content: string): Promise<void>
  fallbackPDFDownload(title: string, htmlContent: string): void
  generateInventoryReport(
    rolls: Record<string, unknown>[],
    summary: Record<string, unknown>
  ): Promise<void>
  generateWasteReport(data: Record<string, unknown>, charts?: string): Promise<void>
}
