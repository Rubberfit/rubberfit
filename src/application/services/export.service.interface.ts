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
}
