"use client"

import { useState } from "react"
import { Download, FileText, Loader2 } from "lucide-react"
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
  // Guards against double-clicks on the slow PDF path so a single user
  // tap doesn't dispatch two `generatePDFReport` calls in flight.
  const [isExporting, setIsExporting] = useState(false)

  const handleExportCsv = () => {
    if (disabled || isExporting) return
    if (input.pos.length === 0) {
      toast.error("No purchase orders to export")
      return
    }
    setIsExporting(true)
    try {
      exportService.exportToCSV(buildPurchaseOrdersCsv(input))
    } catch (error) {
      console.error("Error exporting PO CSV:", error)
      toast.error("Failed to export CSV")
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPdf = async () => {
    if (disabled || isExporting) return
    if (input.pos.length === 0) {
      toast.error("No purchase orders to export")
      return
    }
    setIsExporting(true)
    try {
      const { title, content } = buildPurchaseOrdersPdfHtml(input)
      await exportPdfService.generatePDFReport(title, content)
    } catch (error) {
      console.error("Error generating PO PDF:", error)
      toast.error("Failed to generate report")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled || isExporting}>
          {isExporting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          {isExporting ? "Exporting…" : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportCsv} disabled={disabled || isExporting}>
          <FileText className="size-3.5" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPdf} disabled={disabled || isExporting}>
          <FileText className="size-3.5" />
          Generate PDF Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
