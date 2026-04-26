"use client"

import { Download, FileText } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import { exportService } from "@/src/infrastructure/services/exportService"
import { exportPdfService } from "@/src/infrastructure/services/exportPdfService"

import {
  buildOperationsCsv,
  buildOperationsPdfHtml,
  type OperationsExportInput,
} from "./dashboard-export-utils"

interface DashboardExportMenuProps {
  input: OperationsExportInput
  disabled?: boolean
}

export function DashboardExportMenu({ input, disabled }: DashboardExportMenuProps) {
  const handleExportCsv = () => {
    try {
      exportService.exportToCSV(buildOperationsCsv(input))
    } catch (error) {
      console.error("Error exporting dashboard CSV:", error)
      toast.error("Failed to export CSV")
    }
  }

  const handleExportPdf = async () => {
    try {
      const { title, content } = buildOperationsPdfHtml(input)
      await exportPdfService.generatePDFReport(title, content)
    } catch (error) {
      console.error("Error generating dashboard PDF:", error)
      toast.error("Failed to generate report")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <Download className="size-3.5" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportCsv}>
          <FileText className="size-3.5" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPdf}>
          <FileText className="size-3.5" />
          Generate PDF Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
