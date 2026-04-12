import { format } from "date-fns"
import { toast } from "sonner"
import type { IExportService, ExportData } from "@/src/application/services/export.service.interface"

export type { ExportData }

// Re-export PDF service for consumers that need it
export { exportPdfService } from "./exportPdfService"

export class ExportService implements IExportService {
  exportToCSV(data: ExportData): void {
    try {
      const { headers, rows, filename = "export" } = data

      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          row
            .map((cell) => {
              const cellStr = String(cell ?? "")
              if (cellStr.includes(",") || cellStr.includes('"') || cellStr.includes("\n")) {
                return `"${cellStr.replace(/"/g, '""')}"`
              }
              return cellStr
            })
            .join(",")
        ),
      ].join("\n")

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${filename}_${format(new Date(), "yyyy-MM-dd")}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success("CSV exported successfully")
    } catch (error) {
      console.error("Error exporting CSV:", error)
      toast.error("Failed to export CSV")
    }
  }

  exportInventory(rolls: Record<string, unknown>[]): void {
    const headers = [
      "Material Type",
      "Width (in)",
      "Length (in)",
      "Thickness (in)",
      "Remaining Length (in)",
      "Color",
      "Location",
      "Status",
      "Supplier",
      "Cost per sqft",
      "Date Received",
      "Value",
    ]

    const rows: (string | number | boolean | null | undefined)[][] = rolls.map((roll) => [
      roll.material_type as string,
      roll.width as number,
      roll.length as number,
      roll.thickness as number,
      roll.remaining_length as number,
      (roll.color as string) || "",
      (roll.location as string) || "",
      roll.status as string,
      (roll.supplier as string) || "",
      (roll.cost_per_sqft as number) || 0,
      roll.date_received
        ? format(new Date(roll.date_received as string | number), "yyyy-MM-dd")
        : "",
      (
        ((roll.remaining_length as number) *
          (roll.width as number) *
          ((roll.cost_per_sqft as number) || 0)) /
        144
      ).toFixed(2),
    ])

    this.exportToCSV({ headers, rows, filename: "inventory_export" })
  }

  exportCutHistory(cuts: Record<string, unknown>[]): void {
    const headers = [
      "Date",
      "Material Type",
      "Cut Width (in)",
      "Cut Length (in)",
      "Quantity",
      "Total sqft Used",
      "Waste sqft",
      "Waste %",
      "Job Reference",
      "Cut By",
      "Notes",
    ]

    const rows: (string | number | boolean | null | undefined)[][] = cuts.map((cut) => [
      format(new Date(cut.created_at as string | number), "yyyy-MM-dd HH:mm"),
      String((cut.rolls as Record<string, unknown>)?.material_type || ""),
      cut.cut_width as number,
      cut.cut_length as number,
      cut.quantity as number,
      (cut.total_sqft_used as number)?.toFixed(2) || 0,
      (cut.waste_sqft as number)?.toFixed(2) || 0,
      (cut.waste_percentage as number)?.toFixed(1) || 0,
      String(cut.job_reference || ""),
      String(cut.cut_by || ""),
      String(cut.notes || ""),
    ])

    this.exportToCSV({ headers, rows, filename: "cut_history_export" })
  }

  exportWasteAnalysis(data: Record<string, unknown>[]): void {
    const headers = [
      "Period",
      "Total Cuts",
      "Avg Waste %",
      "Total Waste (sqft)",
      "Total Material Used (sqft)",
      "Efficiency %",
    ]

    const rows: (string | number | boolean | null | undefined)[][] = data.map((item) => [
      item.period as string,
      item.totalCuts as number,
      (item.avgWaste as number)?.toFixed(1) || 0,
      (item.totalWaste as number)?.toFixed(2) || 0,
      (item.totalUsed as number)?.toFixed(2) || 0,
      (100 - ((item.avgWaste as number) || 0)).toFixed(1),
    ])

    this.exportToCSV({ headers, rows, filename: "waste_analysis_export" })
  }

  exportMaterialUsage(data: Record<string, unknown>[]): void {
    const headers = [
      "Material Type",
      "Total Rolls",
      "Active Rolls",
      "Total sqft Available",
      "Total Value",
      "Avg Cost per sqft",
      "Low Stock Alert",
    ]

    const rows: (string | number | boolean | null | undefined)[][] = data.map((item) => [
      item.materialType as string,
      item.totalRolls as number,
      item.activeRolls as number,
      (item.totalSqft as number)?.toFixed(2) || 0,
      (item.totalValue as number)?.toFixed(2) || 0,
      (item.avgCost as number)?.toFixed(2) || 0,
      item.lowStock ? "Yes" : "No",
    ])

    this.exportToCSV({ headers, rows, filename: "material_usage_export" })
  }

  async generatePDFReport(title: string, content: string): Promise<void> {
    const { exportPdfService } = await import("./exportPdfService")
    return exportPdfService.generatePDFReport(title, content)
  }

  fallbackPDFDownload(title: string, htmlContent: string): void {
    import("./exportPdfService").then(({ exportPdfService }) => {
      exportPdfService.fallbackPDFDownload(title, htmlContent)
    })
  }

  async generateInventoryReport(
    rolls: Record<string, unknown>[],
    summary: Record<string, unknown>
  ): Promise<void> {
    const { exportPdfService } = await import("./exportPdfService")
    return exportPdfService.generateInventoryReport(rolls, summary)
  }

  async generateWasteReport(data: Record<string, unknown>, charts?: string): Promise<void> {
    const { exportPdfService } = await import("./exportPdfService")
    return exportPdfService.generateWasteReport(data, charts)
  }
}

export const exportService = new ExportService()
