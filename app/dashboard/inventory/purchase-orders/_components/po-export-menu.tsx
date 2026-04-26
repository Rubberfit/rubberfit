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
  buildPurchaseOrdersCsv,
  buildPurchaseOrdersPdfHtml,
  type PurchaseOrdersExportInput,
} from "./po-export-utils"

interface PurchaseOrdersExportMenuProps {
  input: PurchaseOrdersExportInput
  disabled?: boolean
}

export function PurchaseOrdersExportMenu({ input, disabled }: PurchaseOrdersExportMenuProps) {
  const handleExportCsv = () => {
    if (input.pos.length === 0) {
      toast.error("No purchase orders to export")
      return
    }
    try {
      exportService.exportToCSV(buildPurchaseOrdersCsv(input))
    } catch (error) {
      console.error("Error exporting PO CSV:", error)
      toast.error("Failed to export CSV")
    }
  }

  const handleExportPdf = async () => {
    if (input.pos.length === 0) {
      toast.error("No purchase orders to export")
      return
    }
    try {
      const { title, content } = buildPurchaseOrdersPdfHtml(input)
      await exportPdfService.generatePDFReport(title, content)
    } catch (error) {
      console.error("Error generating PO PDF:", error)
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
